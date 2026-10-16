import "server-only";
import { GoogleGenAI, Type, type Schema } from "@google/genai";
import { FUEL_TYPES } from "@/lib/types";
import { GeminiCallError, type UpstreamErrorKind } from "./errors";
import { SYSTEM_INSTRUCTION, buildAnalyzeParts, type PromptImage } from "./prompt";

/** Gemini へのリクエストタイムアウト（ms）。SDK 側で AbortController により中断される */
export const GEMINI_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Gemini スキーマ（プロンプトの文言と画像の並べ方は ./prompt.ts）
// ---------------------------------------------------------------------------

export { SYSTEM_INSTRUCTION, USER_PROMPT, PAIR_USER_PROMPT } from "./prompt";

const nullableNumber = (description: string): Schema => ({
  type: Type.NUMBER,
  nullable: true,
  description,
});

const confidenceNumber: Schema = { type: Type.NUMBER, minimum: 0, maximum: 1 };

export const RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    date: {
      type: Type.STRING,
      nullable: true,
      description: "給油日 YYYY-MM-DD（西暦）。読めなければ null",
    },
    fuel_amount: nullableNumber("給油量 (L)"),
    total_cost: nullableNumber("支払総額 (円)"),
    price_per_unit: nullableNumber("単価 (円/L)"),
    total_distance: nullableNumber("トリップメーターの区間距離 (km)。オドメーターではない"),
    odometer: nullableNumber("オドメーター/積算距離 (km)。見えていれば"),
    gas_station: {
      type: Type.STRING,
      nullable: true,
      description: "店舗名またはブランド名",
    },
    fuel_type: {
      type: Type.STRING,
      nullable: true,
      enum: [...FUEL_TYPES],
      description:
        "レシートの油種。レギュラー→regular、ハイオク→premium、軽油→diesel、それ以外→other、不明→null",
    },
    confidence: {
      type: Type.OBJECT,
      nullable: true,
      description: "各項目の確信度 0〜1",
      properties: {
        date: confidenceNumber,
        fuel_amount: confidenceNumber,
        total_cost: confidenceNumber,
        price_per_unit: confidenceNumber,
        total_distance: confidenceNumber,
        odometer: confidenceNumber,
        gas_station: confidenceNumber,
        fuel_type: confidenceNumber,
      },
    },
  },
  required: [
    "date",
    "fuel_amount",
    "total_cost",
    "price_per_unit",
    "total_distance",
    "odometer",
    "gas_station",
    "fuel_type",
  ],
  propertyOrdering: [
    "date",
    "fuel_amount",
    "total_cost",
    "price_per_unit",
    "total_distance",
    "odometer",
    "gas_station",
    "fuel_type",
    "confidence",
  ],
};

// ---------------------------------------------------------------------------
// 呼び出し
// ---------------------------------------------------------------------------

/** 上流（Gemini）エラーを分類する */
export function classifyUpstreamError(error: unknown): { kind: UpstreamErrorKind; status?: number } {
  const e = error as { name?: unknown; status?: unknown; code?: unknown; message?: unknown } | null;
  const name = typeof e?.name === "string" ? e.name : "";
  const status = typeof e?.status === "number" ? e.status : undefined;
  const message = typeof e?.message === "string" ? e.message : "";

  // SDK は httpOptions.timeout を AbortController で実装しているため、タイムアウトは AbortError になる
  if (name === "AbortError" || name === "TimeoutError" || /timed? ?out|deadline/i.test(message)) {
    return { kind: "timeout", status };
  }
  if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(message)) {
    return { kind: "quota", status };
  }
  if (status === 408 || status === 504) {
    return { kind: "timeout", status };
  }
  return { kind: "upstream", status };
}

export type GeminiCallParams = {
  apiKey: string;
  model: string;
  /**
   * 送る画像。1 枚（role: combined）か、2 枚（receipt と meter）。
   * 並べ方とラベルは ./prompt.ts の buildAnalyzeParts（1 リクエストで 2 枚とも送る）
   */
  images: readonly PromptImage[];
  timeoutMs?: number;
};

export type GeminiCallResult = {
  /** 応答テキスト。空（ブロック等）のときは undefined */
  text: string | undefined;
  /** text が空のときの診断情報（ブロック理由があれば 422 BLOCKED にする） */
  blockReason?: string;
  finishReason?: string;
};

/**
 * 画像（1 枚または レシート + メーターの 2 枚）を Gemini に送り、応答テキストを返す。
 * 呼び出しに失敗したら分類済みの {@link GeminiCallError} を投げる（元の例外は cause）。
 */
export async function callGemini(params: GeminiCallParams): Promise<GeminiCallResult> {
  const { apiKey, model, images, timeoutMs = GEMINI_TIMEOUT_MS } = params;
  // 役割の組み合わせが不正なら例外（ハンドラは検証済みの値だけを渡す）。SDK 呼び出しの前に組み立てる
  const parts = buildAnalyzeParts(images);
  // クライアントはモジュールロード時ではなく呼び出し時に生成する（API キー未設定を黙って通さないため）
  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts,
        },
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0,
        httpOptions: { timeout: timeoutMs },
      },
    });

    const text = response.text;
    if (!text) {
      return {
        text,
        blockReason: response.promptFeedback?.blockReason,
        finishReason: response.candidates?.[0]?.finishReason,
      };
    }
    return { text };
  } catch (error) {
    const { kind, status } = classifyUpstreamError(error);
    throw new GeminiCallError(kind, status, error);
  }
}
