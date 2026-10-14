import { getSentryOptions } from "@/lib/sentry/options";
import { isSentryConfigured, loadSentry } from "@/lib/sentry/client";

// ブラウザ側の Sentry 初期化。DSN が無ければ SDK を読み込まない（lib/sentry/options.ts）。
//
// SDK は最初に読み込む JS に含めず、動的 import で読み込む（lib/sentry/client.ts。公開ページの初期表示を軽くするため）。
// SDK が読み込まれるまでに起きた未処理の例外は控えておき、初期化の直後に送る（初期表示中のエラーを落とさない）。
type SentryModule = typeof import("@/lib/sentry/browserSdk");

let sentry: SentryModule | null = null;

if (isSentryConfigured()) {
  const early: unknown[] = [];
  const onError = (event: ErrorEvent) => early.push(event.error ?? event.message);
  const onRejection = (event: PromiseRejectionEvent) => early.push(event.reason);
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);

  void loadSentry().then((module) => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
    if (!module) return;
    module.init(getSentryOptions());
    sentry = module;
    for (const error of early) module.captureException(error);
  });
}

// App Router のページ遷移を Sentry に伝える（トレース無効でもパンくずに使われる）。SDK の読み込み前の遷移は記録しない
export function onRouterTransitionStart(...args: Parameters<SentryModule["captureRouterTransitionStart"]>): void {
  sentry?.captureRouterTransitionStart(...args);
}
