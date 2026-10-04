# Supabase 構成ガイド

このディレクトリには FuelLens の **データベーススキーマ (schema-as-code)** と、
Supabase Free プランの **自動停止対策** に関するファイルを置いています。

```
supabase/
├── migrations/
│   ├── 0001_schema_and_rls.sql   # users / vehicles / fuel_records + RLS ポリシー
│   ├── 0002_keepalive.sql        # ハートビートテーブル + keepalive_ping() 関数
│   └── 0003_fuel_records_vehicle_ownership.sql  # fuel_records の insert/update ポリシー強化 (適用済み DB 向け)
└── README.md                     # このファイル
```

関連ファイル:

| ファイル | 役割 |
|---|---|
| `app/api/keepalive/route.ts` | Vercel Cron から叩かれる keepalive エンドポイント |
| `vercel.json` | Vercel Cron の定義 (毎日 UTC 21:00 = JST 06:00) |
| `.github/workflows/supabase-keepalive.yml` | GitHub Actions からの keepalive (1 日 2 回、Vercel と二重化) |

---

## 1. マイグレーションの適用

どの SQL も **冪等** です。新規プロジェクトでも、既にテーブルが存在する本番プロジェクトでも、
番号順にそのまま実行して問題ありません。列の型の変更や行の削除は行いませんが、`0001` は既存のデータ・制約に
対して次の変更を行います。

- **孤児レコードの未分類化**: 存在しない車両を指す `fuel_records.vehicle_id` を `null` に更新する (外部キー追加の前処理)
- **`fuel_records_vehicle_id_fkey` の張り直し**: 既存の制約が `ON DELETE CASCADE` 以外 (`set null` など) なら drop して
  **`ON DELETE CASCADE`** で作り直す (アプリの「車両を削除すると関連する給油記録も削除されます」と一致させる DB 側の安全網)
- **`users.email` を null 許容に変更** (`drop not null`)
- **`vehicles_user_id_fkey` / `fuel_records_user_id_fkey` の追加** (`users(id)` への FK、`ON DELETE CASCADE`):
  本番 DB には既に存在するため同名なら何もしない。新規プロジェクト向けに `NOT VALID` で追加する
- `vehicles_type_check` (CHECK 制約) を `NOT VALID` で追加、RLS の有効化・anon 権限の revoke・ポリシーの作り直し

`0003_fuel_records_vehicle_ownership.sql` は `fuel_records_insert_own` / `fuel_records_update_own` を
「`vehicle_id` は null か自分の車両に限る」定義へ更新するだけのファイルです (`0001` の同じ部分と同一)。
`0001` 適用済みの本番 DB にはこれを単独で実行してください (新規プロジェクトで実行しても無害)。

### 方法 A: SQL Editor (推奨・最も簡単)

1. Supabase Dashboard → **SQL Editor** → **New query**
2. `migrations/0001_schema_and_rls.sql` の内容を貼り付けて **Run**
3. 同様に `migrations/0002_keepalive.sql` → `migrations/0003_fuel_records_vehicle_ownership.sql` を **Run**

### 方法 B: Supabase CLI

このリポジトリには `supabase/config.toml` が含まれていないため、CLI を使う場合は先に
`npx supabase init` で `config.toml` を生成する必要があります (既存の `supabase/migrations/` はそのまま使われます)。

```bash
# 初回のみ
npx supabase init                                # supabase/config.toml を生成
npx supabase login
npx supabase link --project-ref <project-ref>   # URL の https://<project-ref>.supabase.co

# migrations/ を順に適用
npx supabase db push
```

> `supabase/.temp/` は CLI が生成する作業ディレクトリで `.gitignore` 済みです。

### 既存データの CHECK 制約検証 (任意)

`vehicles.type` の CHECK 制約は、既存行に想定外の値があっても移行が失敗しないよう
`NOT VALID` (新規行のみ検証) で追加しています。既存行も検証したい場合は以下を実行してください。

```sql
alter table public.vehicles validate constraint vehicles_type_check;
```

新規プロジェクトで `0001` が `NOT VALID` で追加した `users(id)` への外部キーも、同様に検証できます
(既存行に `users` 行の無い `user_id` があると失敗します)。

```sql
alter table public.vehicles     validate constraint vehicles_user_id_fkey;
alter table public.fuel_records validate constraint fuel_records_user_id_fkey;
```

---

## 2. RLS が有効か確認する

SQL Editor で以下を実行し、すべて `rowsecurity = true` であることを確認します。

```sql
select schemaname, tablename, rowsecurity
  from pg_tables
 where schemaname = 'public'
   and tablename in ('users', 'vehicles', 'fuel_records', 'keepalive');
```

ポリシーの一覧:

```sql
select tablename, policyname, cmd, roles
  from pg_policies
 where schemaname = 'public'
 order by tablename, policyname;
```

期待値: `users` / `vehicles` / `fuel_records` にそれぞれ select / insert / update / delete の 4 本、
`keepalive` には **ポリシーなし** (関数経由でのみ更新)。

### 【必須】余分なポリシーが残っていないか監査する

`0001_schema_and_rls.sql` は **自分が作るポリシー名しか drop しません**。Dashboard で手作業で作った
`using (true)` のようなポリシーが残っていると、ポリシーは許可の OR 結合 (permissive) なので
**他ユーザーのデータにアクセスできてしまいます**。マイグレーション実行後に必ず次を実行してください。

```sql
select schemaname, tablename, policyname, roles, cmd, qual, with_check
  from pg_policies
 where schemaname = 'public'
 order by tablename;
```

`users` / `vehicles` / `fuel_records` に表示されるポリシーが **次の 12 本だけ** であることを確認します。

| テーブル | 本リポジトリが管理するポリシー名 |
|---|---|
| `users` | `users_select_own`, `users_insert_own`, `users_update_own`, `users_delete_own` |
| `vehicles` | `vehicles_select_own`, `vehicles_insert_own`, `vehicles_update_own`, `vehicles_delete_own` |
| `fuel_records` | `fuel_records_select_own`, `fuel_records_insert_own`, `fuel_records_update_own`, `fuel_records_delete_own` |

これ以外のポリシーがあれば削除します (名前は監査クエリの `policyname` 列をそのまま使う)。

```sql
drop policy if exists "<余分なポリシー名>" on public.<テーブル名>;
```

### トラブルシューティング: `permission denied for table ...`

`0001` は anon ロールから 3 テーブルの権限をすべて revoke しています。そのため、Clerk の JWT テンプレートに
`"role": "authenticated"` が無い (または JWT の署名鍵が Supabase の JWT Secret と一致しない) と、
PostgREST はリクエストを **anon として実行**し、アプリ側では次のように見えます。

| 症状 | 原因 → 対処 |
|---|---|
| ログイン中なのに `permission denied for table users` / `vehicles` / `fuel_records` | JWT の `role` が `authenticated` になっていない → Clerk Dashboard の JWT テンプレート "supabase" に `"role": "authenticated"` を追加し、署名鍵を Supabase の JWT Secret に合わせる |
| 「認証トークンを取得できませんでした。再ログインしてください。」 | `lib/supabaseClient.ts` は Clerk のトークンが null のとき **anon に黙ってフォールバックせずこの日本語エラーを投げます** (`SupabaseAuthTokenError`)。Clerk Dashboard に JWT テンプレート "supabase" が存在するか、セッションが有効かを確認する (以前は anon で続行して `permission denied` になっていた) |
| データは読めるが他ユーザーの行まで見える | 上記「余分なポリシーの監査」を実施する |

Dashboard では **Table Editor → 各テーブル → 右上の "RLS enabled"** 表示でも確認できます。
Dashboard の **Advisors → Security Advisor** に "RLS disabled" 等の警告が出ていないことも確認してください。

### Clerk JWT テンプレートの要件

ポリシーは `(select auth.jwt()->>'sub') = user_id` で行を絞り込みます。
Clerk Dashboard → **JWT Templates → "supabase"** が次を満たしている必要があります。

- 署名鍵 = Supabase の JWT Secret (Project Settings → API → JWT Secret)
- Claims に `"role": "authenticated"` を含める (無いと anon 扱いになり全クエリが権限エラー)
- `sub` は Clerk が自動付与 (= `user_xxx`)

> **将来の推奨構成:** Supabase の Third-Party Auth (Clerk) ネイティブ連携
> (Authentication → Sign In / Providers → Third-Party Auth) を使うと JWT Secret の共有が不要になります。
> ポリシーはそのまま流用できます。

---

## 3. 自動停止対策 (keepalive) のセットアップ

### 3-1. Vercel 側: `CRON_SECRET` を設定する

1. Vercel Dashboard → プロジェクト → **Settings → Environment Variables**
2. 以下を追加 (Environment は **Production** 必須。Preview/Development は任意)

   | Name | Value | 備考 |
   |---|---|---|
   | `CRON_SECRET` | ランダムな長い文字列 | `openssl rand -hex 32` などで生成 |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase の service_role キー | **任意**。設定すると件数取得も成功する。未設定なら anon キーで RPC のみ実行 |

   > `CRON_SECRET` を設定しておくと、Vercel は Cron 実行時に自動で
   > `Authorization: Bearer <CRON_SECRET>` ヘッダーを付けてくれます。
   > `SUPABASE_SERVICE_ROLE_KEY` は **絶対に `NEXT_PUBLIC_` を付けない** こと (ブラウザに露出します)。

3. 再デプロイ (環境変数は次回デプロイから反映)
4. Vercel Dashboard → プロジェクト → **Settings → Cron Jobs** に `/api/keepalive` (0 21 * * *) が表示されていることを確認

> Vercel Hobby プランの Cron は「1 日 1 回まで、実行時刻は ±59 分のブレあり、**本番デプロイのみ**」です。

### 3-2. エンドポイントを curl でテストする

```bash
# 本番
curl -i -H "Authorization: Bearer <CRON_SECRET>" https://<your-domain>/api/keepalive

# ローカル (.env.local に CRON_SECRET を書いて npm run dev)
curl -i -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/keepalive
```

| 結果 | 意味 |
|---|---|
| `200 {"ok":true,...,"last_ping":"..."}` | 正常。10 分以内の再実行では `last_ping` が更新されない (スロットル) |
| `401 Unauthorized` | ヘッダーの秘密が一致しない |
| `500 CRON_SECRET is not configured` | Vercel の環境変数未設定 |
| `503 {"ok":false,"paused":true}` | Supabase プロジェクトが停止中 (下記「停止した場合」参照) |
| `502 / 503` (paused=false) | RPC が未適用 (`0002_keepalive.sql` を実行したか確認) など |

`counts.vehicles.error` に `permission denied` が出るのは anon キーで実行している場合の想定内の挙動です
(keepalive 自体は成功しています)。

### 3-3. GitHub 側: リポジトリ Secrets を追加する

GitHub → リポジトリ → **Settings → Secrets and variables → Actions → New repository secret**

| Name | Value |
|---|---|
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase の anon (public) キー |

追加後、**Actions タブ → "Supabase keepalive" → Run workflow** で手動実行し、成功することを確認してください。

> 公開リポジトリでは **60 日間リポジトリに動きが無いと schedule が自動停止** されます。
> Actions タブに "This scheduled workflow is disabled" と出たら **Enable workflow** を押してください。
> (Vercel Cron 側が動いていれば DB の停止自体は防げます)

### 3-4. 手動で RPC を叩く (切り分け用)

```bash
curl -i -X POST "https://<project-ref>.supabase.co/rest/v1/rpc/keepalive_ping" \
  -H "apikey: <anon-key>" \
  -H "Authorization: Bearer <anon-key>" \
  -H "Content-Type: application/json" \
  -d '{"p_source":"manual"}'
# → 200 "2026-10-03T06:00:00.000000+00:00"
```

---

## 4. プロジェクトが停止 (paused) した場合

### 症状

- アプリにログインしてもデータが読み込めない
- Supabase API が **HTTP 540** を返す (`/api/keepalive` は `{"ok":false,"paused":true}`、GitHub Actions は `::error::` 注釈)
- Supabase Dashboard のプロジェクト一覧に **"Paused"** と表示される
- Supabase から「Your project has been paused」のメールが届く

### 復旧手順

1. Supabase Dashboard → 該当プロジェクト → **Restore project** をクリック
2. 数分待つ (データは保持されています)
3. `curl ... /api/keepalive` が 200 を返すことを確認
4. 停止した原因 (Vercel Cron / GitHub Actions のどちらも動いていなかった) を確認する
   - Vercel: Deployments → 最新の本番デプロイ → **Cron Jobs** / Logs に `/api/keepalive` の実行があるか
   - GitHub: Actions タブで "Supabase keepalive" が disabled になっていないか

> Free プランでは **90 日以上停止したままのプロジェクトは削除対象** になるため、
> 停止メールが届いたら早めに Restore してください。

---

## 5. バックアップ

Free プランには自動バックアップがありません。定期的に SQL Editor または Table Editor から
CSV / JSON でエクスポートするか、`pg_dump` を使ってください。

```bash
# 接続文字列は Project Settings → Database → Connection string (URI)
pg_dump "<connection-uri>" --schema=public --data-only -t vehicles -t fuel_records > backup.sql
```
