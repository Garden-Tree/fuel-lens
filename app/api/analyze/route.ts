import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";

// 簡易的なオンメモリ・レートリミット (IPベース)
// 注意: このMapはプロセスメモリ上にあるため、サーバーレス環境（Vercel等）では
// インスタンスごとに別々の状態を持ち、コールドスタートで消える。厳密な制限が必要な場合は
// Upstash Redis 等の外部ストアへの置き換えが必要（後述の anonymousScans も同様）。
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1分
const MAX_REQUESTS_PER_WINDOW = 5;      // 1分間に5回まで
const ipRequests = new Map<string, { count: number; firstRequest: number }>();

// 未ログインユーザーのお試し解析回数制限（IPベース）
const MAX_ANONYMOUS_SCANS = 3;
const MAX_ANONYMOUS_MAP_SIZE = 10000;
const anonymousScans = new Map<string, number>();

// AI応答から許可するフィールドの一覧
const ALLOWED_FIELDS = ["date", "total_distance", "fuel_amount", "gas_station", "price_per_unit", "total_cost"];
// 数値であるべきフィールドの一覧
const NUMERIC_FIELDS = ["total_distance", "fuel_amount", "price_per_unit", "total_cost"];

// Base64データのサイズ上限（10MB相当 ≈ 約13.3M文字）
const MAX_BASE64_LENGTH = 13_300_000;

/**
 * 有効期限切れのIPアドレス履歴をMapから解放し、メモリリークを防ぐヘルパー関数
 */
function cleanupRateLimitMap() {
  const now = Date.now();
  for (const [ip, record] of ipRequests.entries()) {
    if (now - record.firstRequest > RATE_LIMIT_WINDOW_MS) {
      ipRequests.delete(ip);
    }
  }
}

/**
 * AI応答のバリデーション：許可フィールドのみ残し、数値フィールドを検証する
 */
function sanitizeAIResponse(data: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const field of ALLOWED_FIELDS) {
    if (field in data) {
      sanitized[field] = data[field];
    }
  }
  // 数値フィールドの検証：数値でない場合はnullに設定
  for (const field of NUMERIC_FIELDS) {
    if (field in sanitized && sanitized[field] !== null) {
      const value = Number(sanitized[field]);
      sanitized[field] = Number.isFinite(value) ? value : null;
    }
  }
  return sanitized;
}

export async function POST(req: Request) {
  try {
    // ---- Clerk認証チェック ＆ 未ログイン時のお試し制限 ----
    const { userId } = await auth();
    const ip = req.headers.get("x-forwarded-for") || "unknown_ip";

    if (!userId) {
      const scanCount = anonymousScans.get(ip) || 0;
      if (scanCount >= MAX_ANONYMOUS_SCANS) {
        return NextResponse.json(
          { 
            error: "お試し解析の上限（3回）に達しました。引き続き解析機能を利用するには、ログインして無料ユーザー登録を行ってください。",
            code: "ANONYMOUS_LIMIT_EXCEEDED"
          },
          { status: 403 }
        );
      }
    }
    // ----------------------------------------------------

    // リクエスト処理前に古いエントリをクリーンアップ
    cleanupRateLimitMap();

    // ---- レートリミット検証（ログイン有無に関わらず、IP単位で全リクエストに適用） ----
    const now = Date.now();

    if (ip !== "unknown_ip") {
      const record = ipRequests.get(ip);
      if (!record) {
        ipRequests.set(ip, { count: 1, firstRequest: now });
      } else {
        if (now - record.firstRequest > RATE_LIMIT_WINDOW_MS) {
          // 期限切れならリセット
          ipRequests.set(ip, { count: 1, firstRequest: now });
        } else {
          record.count++;
          if (record.count > MAX_REQUESTS_PER_WINDOW) {
            console.warn(`🚨 Rate limit exceeded for IP: ${ip}`);
            return NextResponse.json(
              { error: "リクエストが多すぎます。しばらく時間をおいて再度お試しください。" },
              { status: 429 }
            );
          }
        }
      }
    }
    // -------------------------

    // ---- 入力バリデーション ----
    const res = await req.json();
    const { imageBase64 } = res;

    if (!imageBase64 || typeof imageBase64 !== "string") {
      return NextResponse.json(
        { error: "画像データが不正です。Base64形式の文字列を送信してください。" },
        { status: 400 }
      );
    }

    if (imageBase64.length > MAX_BASE64_LENGTH) {
      return NextResponse.json(
        { error: "画像サイズが大きすぎます。10MB以下の画像を使用してください。" },
        { status: 400 }
      );
    }
    // ---------------------------

    const base64Data = imageBase64.split(",")[1];
    const sizeInKB = Math.round((base64Data.length * 0.75) / 1024);
    console.log(`📷 Server received image size: ${sizeInKB} KB`);

    const prompt = `
      このレシートとメーターの画像から、以下の情報を抽出してJSONで返してください。
      読み取れない場合はnullを入れてください。
      
      出力フォーマット:
      {
        "date": "YYYY-MM-DD",
        "total_distance": 数値(km),
        "fuel_amount": 数値(L),
        "gas_station": "店舗名",
        "price_per_unit": 数値(円/L),
        "total_cost": 数値(円)
      }
    `;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: base64Data,
              },
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
      },
    });

    const responseText = response.text;
    if (!responseText) throw new Error("AIからの応答が空でした");

    const rawData = JSON.parse(responseText);

    // AI応答のバリデーション：許可フィールドのみ残し、数値フィールドを検証
    const data = sanitizeAIResponse(rawData);

    // 単価の自動計算（割り算）
    if (data.total_cost && data.fuel_amount && (data.fuel_amount as number) > 0) {
      data.price_per_unit = Math.round((data.total_cost as number) / (data.fuel_amount as number));
    }

    // 未ログインユーザーの解析成功時にお試しカウントをインクリメント
    if (!userId) {
      if (anonymousScans.size > MAX_ANONYMOUS_MAP_SIZE) {
        anonymousScans.clear(); // メモリリーク防止のため一定サイズでリセット
      }
      const scanCount = anonymousScans.get(ip) || 0;
      anonymousScans.set(ip, scanCount + 1);
    }

    return NextResponse.json(data);

  } catch (error) {
    console.error("Analysis Error:", error);
    return NextResponse.json({ error: "解析に失敗しました" }, { status: 500 });
  }
}