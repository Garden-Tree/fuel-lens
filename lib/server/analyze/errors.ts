/** 上流（Gemini）エラーの分類。詳細はログにのみ出し、クライアントには汎用メッセージを返す */
export type UpstreamErrorKind = "quota" | "timeout" | "upstream";

/** callGemini が投げる分類済みエラー。元の例外は cause に入る */
export class GeminiCallError extends Error {
  readonly kind: UpstreamErrorKind;
  readonly status?: number;

  constructor(kind: UpstreamErrorKind, status: number | undefined, cause: unknown) {
    super(`Gemini call failed (${kind})`, { cause });
    this.name = "GeminiCallError";
    this.kind = kind;
    this.status = status;
  }
}
