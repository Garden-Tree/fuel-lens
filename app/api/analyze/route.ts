import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// 簡易的なオンメモリ・レートリミット (IPベース)
// サーバーレス環境（Vercel等）ではエッジ/インスタンス毎に分離されますが、
// 短時間での単純な連打スパムを抑止する効果はあります。
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1分
const MAX_REQUESTS_PER_WINDOW = 5;      // 1分間に5回まで
const ipRequests = new Map<string, { count: number; firstRequest: number }>();

export async function POST(req: Request) {
  // ★計測開始
  console.time("③ Server: Total Process Time");

  try {
    // ---- レートリミット検証 ----
    const ip = req.headers.get("x-forwarded-for") || "unknown_ip";
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

    const { imageBase64 } = await req.json();
    const base64Data = imageBase64.split(",")[1];
    const sizeInKB = Math.round(base64Data.length * 0.75 / 1024);
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

    console.time("④ Server: Gemini API Call");

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite", // 爆速モデル
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

    console.timeEnd("④ Server: Gemini API Call");

    const responseText = response.text;
    if (!responseText) throw new Error("AIからの応答が空でした");

    const data = JSON.parse(responseText);

    // ★追加ロジック: 単価の自動計算（割り算）
    // AIが「税抜単価」を読み取ってしまう問題を回避するため、
    // 総額と給油量が読み取れていれば、強制的に割り算で「税込単価」を算出する
    if (data.total_cost && data.fuel_amount && data.fuel_amount > 0) {
      // 四捨五入して整数にする（例: 168.4円 → 168円）
      data.price_per_unit = Math.round(data.total_cost / data.fuel_amount);
    }

    console.timeEnd("③ Server: Total Process Time");
    
    return NextResponse.json(data);

  } catch (error) {
    console.error("Analysis Error:", error);
    return NextResponse.json({ error: "解析に失敗しました" }, { status: 500 });
  }
}