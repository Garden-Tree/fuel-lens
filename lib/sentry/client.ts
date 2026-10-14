/**
 * ブラウザ側の Sentry SDK の遅延読み込み。
 *
 * SDK（gzip 後で数十 KB）を最初に読み込む JS に含めないため、`@sentry/nextjs` は必ずここの動的 import で読み込む
 * （クライアントのコードで `import * as Sentry from "@sentry/nextjs"` と静的に書かない。型の import は可）。
 * 読み込む関数は lib/sentry/browserSdk.ts に限る（名前空間ごとの動的 import は tree shaking が効かないため）。
 * DSN（`NEXT_PUBLIC_SENTRY_DSN`）が無いビルドでは SDK を一切読み込まない。
 * 初期化は instrumentation-client.ts が行う。初期化より前に呼ばれた captureClientException / setClientSentryUser も、
 * 同じ Promise の後ろに並ぶので初期化の後に実行される。
 */
type SentryModule = typeof import("./browserSdk");

let loading: Promise<SentryModule | null> | undefined;

/** DSN が設定されたビルドか（無ければ Sentry は無効） */
export function isSentryConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN?.trim());
}

/** SDK を読み込む（1 回だけ）。DSN が無い・読み込みに失敗したときは null */
export function loadSentry(): Promise<SentryModule | null> {
  if (!isSentryConfigured()) return Promise.resolve(null);
  loading ??= import("./browserSdk").catch((err: unknown) => {
    console.error("Sentry の読み込みに失敗しました", err);
    return null;
  });
  return loading;
}

/** 例外を Sentry に送る（DSN が無ければ何もしない） */
export function captureClientException(error: unknown): void {
  void loadSentry().then((sentry) => sentry?.captureException(error));
}

/** エラー報告に紐づけるユーザー ID（ログアウト時は null）。メールや IP は送らない（lib/sentry/scrub.ts） */
export function setClientSentryUser(userId: string | null): void {
  void loadSentry().then((sentry) => sentry?.setUser(userId ? { id: userId } : null));
}
