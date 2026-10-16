import imageCompression, { type Options as CompressionOptions } from "browser-image-compression";
import { TRIAL_REMAINING_HEADER, parseTrialRemaining } from "@/lib/trial";

/**
 * スキャンのクライアント側 I/O（画像の圧縮と /api/analyze の呼び出し）。
 * React に依存しない。状態（読み込み中・プレビュー・確認シート）は lib/scan/useScanPipeline.ts が持つ。
 * 失敗はすべて日本語メッセージの Error で投げる（英語の生エラーは console にだけ出す）。
 */

/** /api/analyze 呼び出しのクライアント側タイムアウト（サーバー側は Gemini 30秒 + 関数全体 60秒） */
export const ANALYZE_TIMEOUT_MS = 45_000;

export const ANALYZE_TIMEOUT_MESSAGE = "解析がタイムアウトしました。通信環境を確認して、もう一度お試しください。";
export const ANALYZE_NETWORK_ERROR_MESSAGE = "サーバーに接続できませんでした。通信環境を確認して、もう一度お試しください。";
export const IMAGE_PROCESS_ERROR_MESSAGE = "画像の処理に失敗しました";
export const IMAGE_READ_ERROR_MESSAGE = "画像の読み込みに失敗しました";

/** 0.8MB 以下・長辺 1200px の JPEG に圧縮する（docs/architecture.md 2 章「スキャンの流れ」） */
export const IMAGE_COMPRESSION_OPTIONS: Readonly<CompressionOptions> = {
  maxSizeMB: 0.8,
  maxWidthOrHeight: 1200,
  useWebWorker: false,
  fileType: "image/jpeg",
};

/**
 * レシートとメーターを別々に撮ったとき（2 枚で送る）の圧縮設定。1 枚 0.6MB 以下・長辺 1200px の JPEG。
 * 2 枚の合計を /api/analyze の上限（1 枚 1.5MB・合計 Base64 3.5MB。lib/analyze.ts）に余裕を持って収める
 */
export const PAIR_IMAGE_COMPRESSION_OPTIONS: Readonly<CompressionOptions> = {
  ...IMAGE_COMPRESSION_OPTIONS,
  maxSizeMB: 0.6,
};

/** Blob を data URL に読み込む。読めなければ IMAGE_READ_ERROR_MESSAGE の Error */
export function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result;
      if (typeof result !== "string") {
        reject(new Error(IMAGE_READ_ERROR_MESSAGE));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => {
      console.error(IMAGE_READ_ERROR_MESSAGE);
      reject(new Error(IMAGE_READ_ERROR_MESSAGE));
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * 画像を圧縮して data URL にする（browser-image-compression → FileReader）。
 * 圧縮の失敗は IMAGE_PROCESS_ERROR_MESSAGE、読み込みの失敗は IMAGE_READ_ERROR_MESSAGE の Error を投げる。
 */
export async function compressToDataUrl(
  file: File,
  options: Readonly<CompressionOptions> = IMAGE_COMPRESSION_OPTIONS
): Promise<string> {
  let compressed: File;
  try {
    compressed = await imageCompression(file, { ...options });
  } catch (error) {
    console.error(error);
    throw new Error(IMAGE_PROCESS_ERROR_MESSAGE);
  }
  return readAsDataUrl(compressed);
}

/**
 * /api/analyze に送る画像。
 * - 文字列: 1 枚（レシートとメーターが一緒に写った写真、またはレシートだけ）
 * - { receipt, meter }: レシートとメーターを別々に撮った 2 枚（1 リクエストで送る）
 */
export type AnalyzeInput = string | { receipt: string; meter: string };

/** /api/analyze の本文（docs/api-analyze.md の 2 つの形）を組み立てる */
export function buildAnalyzeRequestBody(input: AnalyzeInput):
  | { image: string }
  | { images: [{ role: "receipt"; image: string }, { role: "meter"; image: string }] } {
  if (typeof input === "string") return { image: input };
  return {
    images: [
      { role: "receipt", image: input.receipt },
      { role: "meter", image: input.meter },
    ],
  };
}

/** /api/analyze の HTTP 結果。本文は JSON として読めなければ null（中身は信頼しない） */
export type AnalyzeHttpResult = {
  ok: boolean;
  status: number;
  body: unknown;
  /** Retry-After ヘッダー（429 の待ち時間）。無ければ null */
  retryAfter: string | null;
  /** 未ログインのお試しの残り回数（X-Trial-Remaining）。無い・不正なら null。表示にだけ使う */
  trialRemaining: number | null;
};

export type RequestAnalyzeOptions = {
  /** 呼び出し側の中断（画面を離れたとき等）。中断時は AbortError をそのまま投げる */
  signal?: AbortSignal;
  /** タイムアウト（ミリ秒）。超えたら ANALYZE_TIMEOUT_MESSAGE の Error を投げる */
  timeoutMs?: number;
};

/**
 * 画像（data URL。1 枚、またはレシートとメーターの 2 枚）を POST /api/analyze に送り、ステータス・本文・Retry-After を返す。
 * HTTP エラー（4xx / 5xx）は投げずに返す（メッセージは lib/analyze.ts の analyzeErrorMessage で作る）。
 * 投げるのは、タイムアウト（ANALYZE_TIMEOUT_MESSAGE）、接続失敗（ANALYZE_NETWORK_ERROR_MESSAGE）、呼び出し側の中断（AbortError）だけ。
 */
export async function requestAnalyze(
  input: AnalyzeInput,
  { signal, timeoutMs = ANALYZE_TIMEOUT_MS }: RequestAnalyzeOptions = {}
): Promise<AnalyzeHttpResult> {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", onAbort, { once: true });

  // 中断・タイムアウトの例外を日本語メッセージに変換する（呼び出し側の中断はそのまま投げる）
  const rethrow = (error: unknown, fallback: string): never => {
    if (timedOut) throw new Error(ANALYZE_TIMEOUT_MESSAGE);
    if (signal?.aborted) throw error;
    console.error(error);
    throw new Error(fallback);
  };

  try {
    let res: Response;
    try {
      res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildAnalyzeRequestBody(input)),
        signal: controller.signal,
      });
    } catch (error) {
      return rethrow(error, ANALYZE_NETWORK_ERROR_MESSAGE);
    }

    let body: unknown = null;
    try {
      body = await res.json();
    } catch (error) {
      if (timedOut || signal?.aborted) rethrow(error, ANALYZE_NETWORK_ERROR_MESSAGE);
      body = null;
    }
    return {
      ok: res.ok,
      status: res.status,
      body,
      retryAfter: res.headers.get("Retry-After"),
      trialRemaining: parseTrialRemaining(res.headers.get(TRIAL_REMAINING_HEADER)),
    };
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", onAbort);
  }
}
