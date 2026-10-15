# 運用ガイド

デプロイ構成、Supabase の自動停止対策、CI、初回セットアップ、トラブルシューティングをまとめます。
DB の SQL 手順（マイグレーション適用・RLS 監査・バックアップ）は [supabase/README.md](../supabase/README.md) にあります。

## 1. デプロイ構成

| 対象 | 構成 |
|---|---|
| ホスティング | Vercel（Hobby）。GitHub リポジトリ連携 |
| 本番（Production） | `main` ブランチ。ドメインは Vercel の **Settings → Domains** で管理 |
| プレビュー（Preview） | `develop` ブランチ（および PR）。Vercel が発行するプレビュー URL |
| DB | Supabase（Free プラン） |
| 認証 | Clerk |
| 定期実行 | Vercel Cron（本番デプロイのみ）+ GitHub Actions（[3 章](#3-supabase-の自動停止と-keepalive)） |

- 環境変数は Vercel の **Settings → Environment Variables** で Production / Preview ごとに設定します（一覧は [setup.md](./setup.md#環境変数)）。
  変更は次回のデプロイから反映されます。
- Vercel Cron は本番デプロイでしか実行されないため、`CRON_SECRET` は Production に必須、Preview では任意です。
- **Clerk のインスタンス**: 本番は現在 Clerk の **開発インスタンス**（`pk_test_` / `sk_test_` キー）で動いています。
  開発インスタンスは本番運用を想定したものではないため、広く公開する前に本番インスタンスへ移行してください
  （作業内容は [roadmap.md](./roadmap.md) の「Clerk 本番インスタンスへの移行」）。

## 2. 初回セットアップチェックリスト

- [ ] **Supabase**: SQL Editor で `0001` → `0002` → `0003` を実行する（[supabase/README.md 1 章](../supabase/README.md#1-マイグレーションの適用)）
- [ ] **Supabase**: RLS とポリシーを監査する（[supabase/README.md 2 章](../supabase/README.md#2-rls-が有効か確認する)）
- [ ] **Clerk（開発インスタンス）**: JWT テンプレート `supabase` を作成し、環境変数 `NEXT_PUBLIC_CLERK_SUPABASE_JWT_TEMPLATE=supabase` を設定する（[supabase/README.md 3 章](../supabase/README.md#3-clerk-jwt-テンプレートの要件)）
- [ ] **Clerk（本番インスタンス）**: Supabase 連携を有効化し、Supabase に Third-Party Auth（Clerk）を追加する。`NEXT_PUBLIC_CLERK_SUPABASE_JWT_TEMPLATE` は **空のまま**にする（[auth-production.md](./auth-production.md)）
- [ ] **Vercel**: 環境変数を設定し、`CRON_SECRET`（任意で `SUPABASE_SERVICE_ROLE_KEY`）を Production に追加して再デプロイする（[3-3](#3-3-vercel-側の設定)）
- [ ] **Vercel**: **Settings → Cron Jobs** に `/api/keepalive`（`0 21 * * *`）が表示されることを確認する
- [ ] **GitHub**: リポジトリ Secrets に `SUPABASE_URL` / `SUPABASE_ANON_KEY` を追加し、ワークフローを手動実行する（[3-4](#3-4-github-側の設定)）
- [ ] **確認**: `curl` で `/api/keepalive` が 200 を返すことを確認する（[3-5](#3-5-動作確認)）

## 3. Supabase の自動停止と keepalive

### 3-1. 停止の仕組み

Supabase Free プランのプロジェクトは、**約 7 日間 DB へのアクセスが無いと一時停止（paused）** され、
API ゲートウェイが HTTP 540 を返すようになります（Free プランでは無効化できません）。
1 日に数回 DB にアクセスがあれば停止しないため、2 系統から定期的にハートビートを書き込みます。

停止中のアプリの動作（閲覧専用モード・バナー・再試行）は [architecture.md 6 章](./architecture.md#6-障害時の動作) を参照してください。

### 3-2. keepalive の構成

| 経路 | スケジュール | 仕組み |
|---|---|---|
| Vercel Cron（主） | `vercel.json` の `0 21 * * *`（UTC）= 毎日 06:00 JST 頃。Hobby は ±59 分のずれあり | `GET /api/keepalive`（`Authorization: Bearer <CRON_SECRET>`）→ RPC `keepalive_ping('vercel-cron')` と件数取得 |
| GitHub Actions（予備） | `.github/workflows/supabase-keepalive.yml` の `23 3,15 * * *`（UTC）= 12:23 / 00:23 JST 頃。手動実行も可 | PostgREST の `/rest/v1/rpc/keepalive_ping` を anon キーで直接 POST（一時的なネットワークエラーは 2 回までリトライ） |

- `keepalive_ping()` は `supabase/migrations/0002_keepalive.sql` で定義される `security definer` 関数で、
  `keepalive` テーブルの 1 行を更新して `last_ping` を返します。10 分以内の連続呼び出しは書き込みをスキップするため、
  公開情報である anon キーで連打されても負荷は増えません。`keepalive` テーブル自体には PostgREST から直接触れません。
- 公開リポジトリでは、60 日間リポジトリに動きが無いと GitHub Actions の schedule が自動で無効化されます。
  そのため Vercel Cron を主、GitHub Actions を予備としています。
- `/api/keepalive` は `CRON_SECRET` が未設定だと 500 を返し、誤って公開エンドポイントにならないようにしています。
  秘密の比較はタイミング攻撃対策付きです。

### 3-3. Vercel 側の設定

**Settings → Environment Variables** に以下を追加し、再デプロイします（Environment は Production 必須）。

| Name | Value | 備考 |
|---|---|---|
| `CRON_SECRET` | ランダムな長い文字列（`openssl rand -hex 32` など） | 設定すると Vercel が Cron 実行時に `Authorization: Bearer <CRON_SECRET>` を自動で付ける |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase の service_role キー | 任意。設定すると件数取得も成功する。**`NEXT_PUBLIC_` を付けない** |

`/api/keepalive` は `NEXT_PUBLIC_SUPABASE_URL` と、`SUPABASE_SERVICE_ROLE_KEY`（未設定なら `NEXT_PUBLIC_SUPABASE_ANON_KEY`）を使います。

### 3-4. GitHub 側の設定

**Settings → Secrets and variables → Actions → New repository secret** に以下を追加します。

| Name | Value |
|---|---|
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase の anon（public）キー |

追加後、**Actions → "Supabase keepalive" → Run workflow** で手動実行し、成功することを確認します。
Actions タブに "This scheduled workflow is disabled" と表示されたら **Enable workflow** を押してください。

### 3-5. 動作確認

```bash
# 本番
curl -i -H "Authorization: Bearer <CRON_SECRET>" https://<your-domain>/api/keepalive

# ローカル（.env.local に CRON_SECRET を書いて npm run dev）
curl -i -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/keepalive
```

| 結果 | 意味 |
|---|---|
| `200 {"ok":true,"paused":false,"last_ping":"...","key":"...","counts":{...},"elapsed_ms":...}` | 正常。10 分以内の再実行では `last_ping` は更新されない |
| `401 {"ok":false,"error":"Unauthorized"}` | ヘッダーの秘密が一致しない |
| `500 {"ok":false,"error":"CRON_SECRET is not configured"}` | `CRON_SECRET` が未設定 |
| `500 {"ok":false,"error":"Supabase env vars are not configured"}` | Supabase の URL / キーが未設定 |
| `503 {"ok":false,"paused":true,"status":540,...}` | プロジェクトが停止中（[3-6](#3-6-停止した場合の復旧)） |
| `503`（`paused: false`） | Supabase に接続できない、または 5xx |
| `502` | その他の RPC エラー（`0002_keepalive.sql` を適用していないなど） |

`key` は使ったキー（`service_role` / `anon`）です。anon キーで実行した場合、`counts` の各 `count` は `null`、
`error` は権限エラーになりますが、これは想定どおりです（keepalive 自体は成功しています）。

RPC を直接叩いて切り分けるには次のようにします。

```bash
curl -i -X POST "https://<project-ref>.supabase.co/rest/v1/rpc/keepalive_ping" \
  -H "apikey: <anon-key>" \
  -H "Authorization: Bearer <anon-key>" \
  -H "Content-Type: application/json" \
  -d '{"p_source":"manual"}'
# → 200 "2026-10-03T06:00:00.000000+00:00"
```

### 3-6. 停止した場合の復旧

症状:

- ログイン中の画面に「クラウドDBが一時停止中です。…」のバナーが出て、閲覧専用になる
- Supabase API が HTTP 540 を返す（`/api/keepalive` は `503 {"ok":false,"paused":true}`、
  GitHub Actions は「Supabase プロジェクトが一時停止 (paused) されています」の `::error::` 注釈で失敗する）
- Supabase Dashboard のプロジェクト一覧に "Paused" と表示される、または停止を知らせるメールが届く

復旧手順:

1. Supabase Dashboard → 該当プロジェクト → **Restore project** をクリックし、数分待つ（データは保持されます）
2. `curl` で `/api/keepalive` が 200 を返すことを確認する
3. アプリはバナーの「再試行」、またはネットワーク復帰・タブの再表示で自動的に通常モードに戻る
4. 両方の経路が止まっていた原因を確認する
   - Vercel: Deployments → 最新の本番デプロイ → Cron Jobs / Logs に `/api/keepalive` の実行があるか
   - GitHub: Actions タブで "Supabase keepalive" が無効化されていないか

停止したまま長期間（公式ドキュメント上は停止から 1 年。https://supabase.com/docs/guides/platform/free-project-pausing 参照）経つと Dashboard から復元できなくなるため、停止に気付いたら早めに Restore してください。

## 4. CI

`.github/workflows/ci.yml` が `main` / `develop` への push とすべての Pull Request で実行されます。

- Node 22、`npm ci` → `npm run lint` → `npx tsc --noEmit` → `npm test` → `npm run build`（タイムアウト 15 分）。
  ビルドは 3 回まで再試行する: `next/font/google` がビルド時に Google Fonts を取得するため、Actions のネットワークの一時的な失敗で「Can't resolve '@vercel/turbopack-next/internal/font/google/font'」になることがある（2026-10-14 に発生。同じコミットの再実行で成功）
- 同じブランチの古い実行は自動でキャンセルされます。権限は `contents: read` のみです。
- ビルドはプレースホルダの環境変数で行い、Clerk / Supabase / Gemini の実 API には接続しません。
  Clerk の公開キーは形式チェックを通すため `pk_test_` + base64(`clerk.example.com$`) のダミー値を使っています。
  それでもビルドが失敗する場合は、Clerk 開発インスタンスの実キーをリポジトリ Secrets に登録して差し替えます。
- `next/font/google` がビルド時に Google Fonts を取得するため、ビルドにはインターネット接続が必要です。

## 4-2. Web Analytics（ページビュー計測）

`@vercel/analytics` の `<Analytics />`（`components/WebAnalytics.tsx` で包み、`app/layout.tsx` に 1 つ置いています）。Cookie は使わず、ページビューだけを Vercel に送ります（カスタムイベントは使いません）。

- **有効化**: Vercel ダッシュボードの **Project → Analytics → Enable** を押す必要があります（押すまでデータは溜まりません）。有効化後、次のデプロイから `/_vercel/insights/*` が配信されます。
- **送信されるのは本番のみ**: パッケージは `NODE_ENV` で本番かどうかを判定し、開発・テストではコンソールに出すだけで送信しません。
- **除去する情報**: `beforeSend`（`lib/analytics/scrubUrl.ts`）でハッシュと、`utm_source` / `utm_medium` / `utm_campaign` / `utm_content` / `utm_term` 以外のクエリを落とします（共有トークン `?t=` や記録 ID は送らない）。集客の効果は Analytics の「UTM Parameters」で見られます。
  `?action=shared&t=<token>` の共有トークンや `/history#record-<id>` の記録 ID は送られません。
- **Hobby の上限**: 月 50,000 イベント（ページビュー + カスタムイベント、チーム内の全プロジェクト合計）、レポート期間 1 か月。カスタムイベントは Pro 以上です。
  上限を超えても課金されず、3 日の猶予後に収集が止まります（出典: https://vercel.com/docs/analytics/limits-and-pricing ）。
- CSP ヘッダーは設定していないため、追加の許可は不要です。`proxy.ts` の matcher は `_vercel` を除外しています。

## 4-3. Sentry（エラー監視）

`@sentry/nextjs`（11.7.0）で、ブラウザ・サーバーの未処理エラーを Sentry に集めます。**エラーだけ**を送り（`tracesSampleRate: 0`、Session Replay なし、個人情報の自動収集オフ。v11 では `sendDefaultPii` の代わりに `dataCollection` を使う）、無料枠の消費を抑えています。

| ファイル | 役割 |
|---|---|
| `instrumentation-client.ts` | ブラウザ側の初期化。SDK は動的 import で後から読み込み（DSN が無いビルドでは読み込まない）、読み込み前の未処理例外は控えて初期化後に送る |
| `lib/sentry/client.ts` / `lib/sentry/browserSdk.ts` | ブラウザでの遅延読み込み（`captureClientException` / `setClientSentryUser`）。クライアントのコードは `@sentry/nextjs` を静的に import しない（最初に読み込む JS から SDK を外すため） |
| `instrumentation.ts` / `sentry.server.config.ts` / `sentry.edge.config.ts` | サーバー側の初期化と `onRequestError`（Server Component・Route Handler・`proxy.ts` の例外） |
| `app/global-error.tsx` / `app/error.tsx` | レンダリングエラーを `captureClientException` で送る（日本語 UI はそのまま） |
| `lib/sentry/options.ts` / `lib/sentry/scrub.ts` | 共通オプションと、送信前に個人情報を落とす `beforeSend`（テストは `tests/sentryScrub.test.ts`） |
| `next.config.ts` | `withSentryConfig`（ソースマップのアップロード。環境変数だけで制御） |

- **DSN が未設定なら完全に無効**です（送信せず、コンソールにも何も出さない）。ローカル・CI・Preview は DSN を入れなければ従来どおりです。CI は Sentry 関連の環境変数なしでビルドできます。
- **環境名とリリース**: `VERCEL_ENV`（production / preview / development）と `VERCEL_GIT_COMMIT_SHA` を使います（`next.config.ts` がクライアントにも埋め込みます）。Vercel 以外では環境名は `NODE_ENV` になります。
- **送らない情報**: URL のクエリ文字列とハッシュ（共有トークン `?action=shared&t=…`、`#record-<id>`）、Cookie、`/api/analyze` のリクエスト本文（画像）とヘッダー、メールアドレス・IP・ユーザー名。ユーザーは Clerk の ID だけを紐づけます（`components/UserSync.tsx`）。
- **`/api/analyze` の相関**: 想定外の例外（`INTERNAL_ERROR`）は `requestId` タグ付きで送られます。画面に出るエラーの `requestId` で Sentry の Issue 検索（`requestId:xxxxxxxx`）や Vercel のログ（`[analyze xxxxxxxx]`）と突き合わせられます。

### 4-3-1. Sentry プロジェクトの作り方

1. https://sentry.io でアカウントを作り、**Create Project** → プラットフォームは **Next.js** を選ぶ。ウィザード（`npx @sentry/wizard`）は**実行しない**（設定済みのため）。
2. **DSN**: プロジェクトの **Settings → Client Keys (DSN)** にある `https://<key>@o<orgId>.ingest.sentry.io/<projectId>`。
3. **組織スラッグ / プロジェクトスラッグ**: **Settings → General Settings** に表示されるスラッグ（URL にも含まれる）。
4. **認証トークン**（ソースマップ用、任意）: **Settings → Developer Settings → Organization Tokens**（または **Auth Tokens**）で作成する。

### 4-3-2. Vercel の環境変数

**Settings → Environment Variables** に追加して再デプロイします。

| Name | Production | Preview | 備考 |
|---|---|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | **必須（これだけで有効化）** | 任意 | Preview にも入れると Preview のエラーも届く（Issue は `environment: preview` で分かれる） |
| `SENTRY_ORG` | 任意 | 任意 | ソースマップ用 |
| `SENTRY_PROJECT` | 任意 | 任意 | ソースマップ用 |
| `SENTRY_AUTH_TOKEN` | 任意 | 任意 | ソースマップ用。ビルド時のみ使う秘密なので `NEXT_PUBLIC_` を付けない。3 つ揃うとスタックトレースが元のソースで読める |

`NEXT_PUBLIC_` の値はビルド時にブラウザ向けバンドルへ埋め込まれるため、DSN を変えたら再デプロイが必要です。

### 4-3-3. 無料枠（Developer プラン）

月 5,000 エラー、ユーザー 1 人、データ保持 30 日、プロジェクト数は無制限（出典: https://sentry.io/pricing/ ）。同じ原因のエラーが大量に出ると枠を使い切るため、Issue が溜まっていないか時々確認してください。

### 4-3-4. 動作確認

1. DSN を入れてデプロイする（ローカルなら `.env.local` に `NEXT_PUBLIC_SENTRY_DSN` を入れて `npm run build && npm start`）。
2. エラーを起こす。ブラウザのコンソールから投げたエラーは Sentry に拾われないため、一時的に任意のコンポーネントの描画中に `throw new Error("sentry test")` を入れる。`app/error.tsx` の「問題が発生しました」画面が出る。
3. Sentry の **Issues** に `sentry test` が現れ、環境が `production`（ローカルは `production` ビルドなら `production`、`npm run dev` なら `development`）、URL にクエリやハッシュが付いていないことを確認する。確認後、テスト用のコードは必ず戻す。
4. DSN が空のビルドでは、同じ操作をしても `ingest.sentry.io` への通信が発生しない。

広告ブロッカーがブラウザからの送信を止めることがあります（ブラウザ側のエラーが一部欠ける）。必要になったら `tunnelRoute` を検討しますが、`proxy.ts` の matcher からの除外とサーバーレス関数の実行増を伴うため、現状は使っていません。

## 4-4. OG 画像

- `app/opengraph-image.tsx` / `app/twitter-image.tsx`（`lib/og/renderOgImage.tsx`）は `dynamic = "force-dynamic"` で、**リクエスト時**に Google Fonts の CSS API から使う文字だけの Noto Sans JP / JetBrains Mono（700、ttf）を取得して描画します（ビルドは Google Fonts に依存しないので、取得失敗でビルドが壊れたり、フォント無しの画像が焼き込まれたりしません）。
- 公開ツールページにも専用の画像があります: `app/calc/` と `app/gas-cost/` の `opengraph-image.tsx` / `twitter-image.tsx`（`lib/og/renderToolOgImage.tsx`）。ツール名・サブタイトル・計算式の例・「登録不要・無料」・ドメインを載せ、デザイントークンとフォント取得（`lib/og/shared.tsx`）はルートの画像と共通です。ページの `metadata.openGraph` に `images` を書かない限り、Next.js がこのファイルを `og:image` / `twitter:image` に自動で入れます（ルートの画像より優先）。画像のルートだけが動的で、`/calc` と `/gas-cost` のページ自体は静的なままです。新しい公開ページに専用画像を足すときは、同じ形で `renderToolOgImage` を呼ぶファイルを置きます。
- フォントの取得に失敗（5 秒でタイムアウト）した場合は console にエラーを出し、デフォルトフォントで描画します（日本語は表示されない）。クローラーのキャッシュに残らないよう、共有が崩れていたら Vercel のログで `OG 画像のフォント取得に失敗しました` を確認してください。

## 5. トラブルシューティング

| 症状 | 原因と対処 |
|---|---|
| ログイン中なのに `permission denied for table users` / `vehicles` / `fuel_records`、または画面に「アクセス権限がありません。ログインし直してください。」 | JWT の `role` が `authenticated` でない、または署名鍵が Supabase の JWT Secret と一致せず anon として実行されている。Clerk の JWT テンプレート `supabase` を確認する（[supabase/README.md 3 章](../supabase/README.md#3-clerk-jwt-テンプレートの要件)） |
| 「認証トークンを取得できませんでした。再ログインしてください。」 | Clerk からトークンを取得できない。Clerk Dashboard に JWT テンプレート `supabase` が存在するか（`NEXT_PUBLIC_CLERK_SUPABASE_JWT_TEMPLATE` を設定したインスタンスのみ）、本番インスタンスでは Supabase 連携 / Third-Party Auth が有効か、セッションが有効かを確認する |
| 他のユーザーの行まで見える | 手作業で作った余分なポリシーが残っている。ポリシーを監査して削除する（[supabase/README.md 2 章](../supabase/README.md#2-rls-が有効か確認する)） |
| 「クラウドDBが一時停止中です。…」のバナー、API が 540 | プロジェクトが停止している（[3-6](#3-6-停止した場合の復旧)） |
| 「クラウドDBに接続できません。…」のバナー | ネットワーク断、または Supabase が 5xx を返している。復旧後に「再試行」を押す |
| `/api/keepalive` が 401 / 500 | `CRON_SECRET` の不一致 / 未設定（[3-5](#3-5-動作確認)） |
| AI 解析が 403 `ORIGIN_MISMATCH` | リバースプロキシやカスタムドメインで `Host` が公開ホストと異なる。`NEXT_PUBLIC_APP_URL` を設定する（[api-analyze.md](./api-analyze.md)） |
| AI 解析が 500 `SERVER_MISCONFIGURED` | `GEMINI_API_KEY` が未設定 |
| ローカルの記録がクラウドに移行されない | 画面の移行エラー表示を確認する。データはブラウザに残り、次回の読み込みで再試行される（[architecture.md 5 章](./architecture.md#5-ローカル--クラウド移行)） |

## 週次の利用状況（集客の効果測定）

[supabase/runbooks/weekly_metrics.sql](../supabase/runbooks/weekly_metrics.sql) を Supabase の SQL Editor で実行する（読み取りのみ・件数だけ）。

- 全体の件数（ユーザー・車両・記録）
- 直近 12 週の新規ユーザー・記録したユーザー・追加された記録
- 定着（記録が 2 回以上・5 回以上のユーザーの割合）

流入元は Vercel Web Analytics の Referrers、検索語は Search Console（`https://fuel-lens.gadelog.com/`。所有権確認ファイル `public/google9896bbc9767c6e06.html` は消さない）で見る。
Bing は Bing Webmaster Tools（オーナーの Google アカウント。2026-10-15 に Search Console から取り込み、サイトマップも取り込み済み）で見る。所有権は Search Console 経由で確認しているため、上の確認ファイルが Bing 側の確認も兼ねる。

公開ページを増やしたら、Search Console の「URL 検査」→「インデックス登録をリクエスト」と、Bing Webmaster Tools の「URL Submission」で新しい URL を送る（サイトマップだけでも拾われるが、数日〜数週間早くなる）。
2026-10-15 時点: トップは 2026-05-10 のクロール（当時は `X-Robots-Tag: noindex`）のまま除外されていたため再クロールを依頼済み。`/calc` は「検出 - インデックス未登録」で依頼済み。
集客用の下書きはリポジトリ直下の `marketing/`（`.gitignore` 済み。個人の燃費データを含むため公開リポジトリにコミットしない）。
