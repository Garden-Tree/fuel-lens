// lib/sentry/client.ts が動的 import するブラウザ用の Sentry の関数。
// `import("@sentry/nextjs")` と名前空間ごと読み込むと未使用の機能まで含まれて大きくなる（gzip 後 約 157KB）ため、
// 使う関数だけをここで再エクスポートして tree shaking を効かせる。使う関数を増やすときはここに足す。
export { init, captureException, setUser, captureRouterTransitionStart } from "@sentry/nextjs";
