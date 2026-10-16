# 開発環境のセットアップ

FuelLens をローカルで動かす手順、環境変数、開発コマンドをまとめます。
本番環境（Vercel・Supabase・Clerk）の構成と運用は [operations.md](./operations.md) を参照してください。

## クイックスタート

```bash
git clone https://github.com/Garden-Tree/fuel-lens.git
cd fuel-lens
npm install
cp .env.example .env.local   # 下表を参考に値を設定する
npm run dev                  # http://localhost:3000
```

ログイン後のクラウド保存を使うには、Supabase へのスキーマ適用と Clerk の JWT テンプレート設定が必要です
（[supabase/README.md](../supabase/README.md)）。
未ログインでの手動入力・履歴・統計は、Supabase と Gemini の設定がなくても動作します。

## 環境変数

| 変数名 | 必須 | 用途 |
|---|---|---|
| `GEMINI_API_KEY` | 必須 | Gemini API（AI 解析）のキー。サーバー専用 |
| `GEMINI_MODEL` | 任意 | 使用モデル。未設定時は `gemini-3.1-flash-lite` |
| `GEMINI_FALLBACK_MODEL` | 任意 | 503 などが続いたときの代替モデル。未設定時は `gemini-2.5-flash`。空文字で無効 |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | 必須 | Clerk（認証）の公開キー |
| `CLERK_SECRET_KEY` | 必須 | Clerk のシークレットキー |
| `NEXT_PUBLIC_CLERK_SUPABASE_JWT_TEMPLATE` | 任意 | Supabase に渡す Clerk トークンの取得方法。`supabase` を設定すると JWT テンプレート方式（開発インスタンス用）、空なら `getToken()` のネイティブ Third-Party Auth（本番インスタンス用） |
| `NEXT_PUBLIC_SUPABASE_URL` | 必須 | Supabase プロジェクトの URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 必須 | Supabase の anon キー（RLS 前提） |
| `NEXT_PUBLIC_APP_URL` | 任意 | アプリの公開 URL。`/api/analyze` の Origin 許可ホストと `metadataBase` に使う |
| `NEXT_PUBLIC_ENABLE_SW` | 任意 | `1` で開発ビルドでも Service Worker（Web Share Target の受け取り）を登録する。本番ビルドでは常に登録 |
| `TRIAL_COOKIE_SECRET` | 任意 | 未ログインのお試し読み取りの Cookie 署名鍵（サーバー専用。`openssl rand -base64 32` などで生成）。設定すると未ログインでも端末ごとに 3 回まで AI 解析を試せる（IP ごとに 1 日 10 回の上限つき）。未設定ならお試しは無効で、未ログインの AI 解析は 401。公開ページの文言もビルド時にこれで切り替わる（[api-analyze.md](./api-analyze.md#未ログインのお試し読み取り)） |
| `CRON_SECRET` | 本番で必須 | Vercel Cron → `/api/keepalive` の認証用シークレット |
| `SUPABASE_SERVICE_ROLE_KEY` | 任意 | `/api/keepalive` で件数取得まで行う場合に設定。サーバー専用（`NEXT_PUBLIC_` を付けない） |
| `NEXT_PUBLIC_SENTRY_DSN` | 任意 | Sentry（エラー監視）の DSN。未設定なら Sentry は完全に無効。本番では設定を推奨（[operations.md](./operations.md#4-3-sentryエラー監視)） |
| `SENTRY_ORG` / `SENTRY_PROJECT` | 任意 | Sentry の組織・プロジェクトのスラッグ。ソースマップのアップロード用（ビルド時のみ） |
| `SENTRY_AUTH_TOKEN` | 任意 | ソースマップのアップロード用トークン。ビルド時のみ・サーバー専用（`NEXT_PUBLIC_` を付けない）。未設定でもビルドは通る |
| `ANDROID_ASSETLINKS_SHA256` | 任意 | Google Play 版（TWA）のアプリ署名鍵の SHA-256 フィンガープリント。カンマ区切りで複数可。`/.well-known/assetlinks.json` に載せる（未設定なら 404）。手順は [play-store/README.md](./play-store/README.md) |

各変数の詳細は [.env.example](../.env.example)、`/api/analyze` 関連は [api-analyze.md](./api-analyze.md)、
keepalive 関連は [operations.md](./operations.md) を参照してください。

## 開発コマンド

```bash
npm run dev          # 開発サーバー (http://localhost:3000)
npm run lint         # ESLint (eslint-config-next)
npm run typecheck    # 型チェック (tsc --noEmit)
npm test             # 単体テスト (Vitest)
npm run build        # 本番ビルド
```

変更後は `npm run lint && npm run typecheck` を通してからコミットしてください。
CI（GitHub Actions）も同じ順序で lint → typecheck → test → build を実行します（[operations.md](./operations.md#4-ci)）。

## 次に読むもの

- [docs/README.md](./README.md) — ドキュメントの索引（設計・API・運用・ロードマップ）
- [CLAUDE.md](../CLAUDE.md) — AI エージェント向けの作業ルールと守るべき不変条件
