// src/app/api/analyze/route.ts
import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

// 新しいSDK初期化
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(req: Request) {
  // ★計測開始: サーバー処理全体
  console.time("③ Server: Total Process Time");

  try {
    const { imageBase64 } = await req.json();
    const base64Data = imageBase64.split(",")[1];

    // 受信した画像サイズをログ出力 (KB単位)
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

    // ★計測開始: Gemini呼び出し
    console.time("④ Server: Gemini API Call");

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite", 
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

    console.timeEnd("④ Server: Gemini API Call"); // ログ出力

    const responseText = response.text;
    
    if (!responseText) {
        throw new Error("AIからの応答が空でした");
    }

    const data = JSON.parse(responseText);

    console.timeEnd("③ Server: Total Process Time"); // ログ出力
    
    return NextResponse.json(data);

  } catch (error) {
    console.error("Analysis Error:", error);
    return NextResponse.json({ error: "解析に失敗しました" }, { status: 500 });
  }
}