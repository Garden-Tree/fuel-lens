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

- 環境変数は Vercel の **Settings → Environment Variables** で Production / Preview ごとに設定します（一覧は [README](../README.md#環境変数)）。
  変更は次回のデプロイから反映されます。
- Vercel Cron は本番デプロイでしか実行されないため、`CRON_SECRET` は Production に必須、Preview では任意です。
- **Clerk のインスタンス**: 本番は現在 Clerk の **開発インスタンス**（`pk_test_` / `sk_test_` キー）で動いています。
  開発インスタンスは本番運用を想定したものではないため、広く公開する前に本番インスタンスへ移行してください
  （作業内容は [roadmap.md](./roadmap.md) の「Clerk 本番インスタンスへの移行」）。

## 2. 初回セットアップチェックリスト

- [ ] **Supabase**: SQL Editor で `0001` → `0002` → `0003` を実行する（[supabase/README.md 1 章](../supabase/README.md#1-マイグレーションの適用)）
- [ ] **Supabase**: RLS とポリシーを監査する（[supabase/README.md 2 章](../supabase/README.md#2-rls-が有効か確認する)）
- [ ] **Clerk**: JWT テンプレート `supabase` を作成する（[supabase/README.md 3 章](../supabase/README.md#3-clerk-jwt-テンプレートの要件)）
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

- Node 22、`npm ci` → `npm run lint` → `npx tsc --noEmit` → `npm test` → `npm run build`（タイムアウト 15 分）
- 同じブランチの古い実行は自動でキャンセルされます。権限は `contents: read` のみです。
- ビルドはプレースホルダの環境変数で行い、Clerk / Supabase / Gemini の実 API には接続しません。
  Clerk の公開キーは形式チェックを通すため `pk_test_` + base64(`clerk.example.com$`) のダミー値を使っています。
  それでもビルドが失敗する場合は、Clerk 開発インスタンスの実キーをリポジトリ Secrets に登録して差し替えます。
- `next/font/google` がビルド時に Google Fonts を取得するため、ビルドにはインターネット接続が必要です。

## 5. トラブルシューティング

| 症状 | 原因と対処 |
|---|---|
| ログイン中なのに `permission denied for table users` / `vehicles` / `fuel_records`、または画面に「アクセス権限がありません。ログインし直してください。」 | JWT の `role` が `authenticated` でない、または署名鍵が Supabase の JWT Secret と一致せず anon として実行されている。Clerk の JWT テンプレート `supabase` を確認する（[supabase/README.md 3 章](../supabase/README.md#3-clerk-jwt-テンプレートの要件)） |
| 「認証トークンを取得できませんでした。再ログインしてください。」 | Clerk からトークンを取得できない。Clerk Dashboard に JWT テンプレート `supabase` が存在するか、セッションが有効かを確認する |
| 他のユーザーの行まで見える | 手作業で作った余分なポリシーが残っている。ポリシーを監査して削除する（[supabase/README.md 2 章](../supabase/README.md#2-rls-が有効か確認する)） |
| 「クラウドDBが一時停止中です。…」のバナー、API が 540 | プロジェクトが停止している（[3-6](#3-6-停止した場合の復旧)） |
| 「クラウドDBに接続できません。…」のバナー | ネットワーク断、または Supabase が 5xx を返している。復旧後に「再試行」を押す |
| `/api/keepalive` が 401 / 500 | `CRON_SECRET` の不一致 / 未設定（[3-5](#3-5-動作確認)） |
| AI 解析が 403 `ORIGIN_MISMATCH` | リバースプロキシやカスタムドメインで `Host` が公開ホストと異なる。`NEXT_PUBLIC_APP_URL` を設定する（[api-analyze.md](./api-analyze.md)） |
| AI 解析が 500 `SERVER_MISCONFIGURED` | `GEMINI_API_KEY` が未設定 |
| ローカルの記録がクラウドに移行されない | 画面の移行エラー表示を確認する。データはブラウザに残り、次回の読み込みで再試行される（[architecture.md 5 章](./architecture.md#5-ローカル--クラウド移行)） |
