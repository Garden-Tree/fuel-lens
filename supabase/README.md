# Supabase DB runbook

FuelLens の **データベーススキーマ（schema-as-code）** と、その適用・監査・バックアップの手順です。

```
supabase/
├── migrations/
│   ├── 0001_schema_and_rls.sql                  # users / vehicles / fuel_records + RLS ポリシー
│   ├── 0002_keepalive.sql                       # keepalive テーブル + keepalive_ping() 関数
│   ├── 0003_fuel_records_vehicle_ownership.sql  # fuel_records の insert/update ポリシー強化（適用済み DB 向け）
│   └── 0004_fill_chain.sql                      # オドメーター・部分給油・記録漏れ・燃料種別・メモ・車両の距離の入力方式
└── README.md                                    # このファイル
```

関連ドキュメント:

- テーブルの意味（未分類・既定車両など）とアプリ側のデータの流れ: [docs/architecture.md](../docs/architecture.md)
- 自動停止対策（keepalive）の設計、Vercel / GitHub の設定、停止時の復旧、トラブルシューティング:
  [docs/operations.md](../docs/operations.md)

---

## 1. マイグレーションの適用

どの SQL も **冪等** です。新規プロジェクトでも、既にテーブルがある本番プロジェクトでも、番号順にそのまま実行できます。

| ファイル | 内容 |
|---|---|
| `0001_schema_and_rls.sql` | テーブル・インデックス・外部キー・CHECK 制約の作成、RLS の有効化、anon 権限の revoke、12 本のポリシーの作り直し |
| `0002_keepalive.sql` | `keepalive` テーブル（1 行のみ、ポリシーなし）と `security definer` 関数 `keepalive_ping()`（10 分スロットル） |
| `0003_fuel_records_vehicle_ownership.sql` | `fuel_records_insert_own` / `fuel_records_update_own` を「`vehicle_id` は null か自分の車両に限る」定義へ更新（`0001` の該当部分と同一） |
| `0004_fill_chain.sql` | `fuel_records` に `odometer` / `is_full`（既定 true）/ `missed_previous`（既定 false）/ `fuel_type` / `memo`、`vehicles` に `distance_mode`（既定 `'trip'`）/ `default_fuel_type` を追加。CHECK 制約 4 本を `NOT VALID` で追加（仕様は [docs/design-fill-chain.md](../docs/design-fill-chain.md)） |

`0001` は列の型の変更や行の削除は行いませんが、既存のデータ・制約に対して次の変更を行います。

- **孤児レコードの未分類化**: 存在しない車両を指す `fuel_records.vehicle_id` を `null` に更新する（外部キー追加の前処理）
- **`fuel_records_vehicle_id_fkey` の張り直し**: 既存の制約が `ON DELETE CASCADE` 以外（`set null` など）なら drop して
  `ON DELETE CASCADE` で作り直す（アプリの「車両を削除すると関連する給油記録も削除されます」と一致させる DB 側の安全網）
- **`users.email` を null 許容に変更**（`drop not null`）
- **`vehicles_user_id_fkey` / `fuel_records_user_id_fkey` の追加**（`users(id)` への FK、`ON DELETE CASCADE`）:
  同名の制約があれば何もしない。無ければ `NOT VALID` で追加する
- **`vehicles_type_check`**（`type in ('car', 'bike')`）を `NOT VALID` で追加する

`0003` は、`0001` を適用済みの本番 DB にポリシーの強化だけを適用するためのファイルです（新規プロジェクトで実行しても無害）。

`0004` は列の追加と CHECK 制約の追加だけを行い、既存行は書き換えません（既定値は定数なので PostgreSQL 11 以降はテーブルの再書き込みも起きない）。
既存の記録は「満タン・記録漏れなし・オドメーターなし」、既存の車両は「トリップ」として読まれ、表示も計算も変わりません。
**アプリが新しい列を送るリリースより前に適用してください**（未適用の DB に新しい列を送ると PostgREST が `PGRST204` で拒否します）。

### 方法 A: SQL Editor（推奨）

1. Supabase Dashboard → **SQL Editor** → **New query**
2. `migrations/0001_schema_and_rls.sql` の内容を貼り付けて **Run**
3. 同様に `migrations/0002_keepalive.sql` → `migrations/0003_fuel_records_vehicle_ownership.sql` → `migrations/0004_fill_chain.sql` を **Run**
   （必ず `0001` → `0002` → `0003` → `0004` の順）
4. 続けて [2 章](#2-rls-が有効か確認する) の確認とポリシー監査を行う

### 方法 B: Supabase CLI

このリポジトリには `supabase/config.toml` が含まれていないため、先に `npx supabase init` で生成します
（既存の `supabase/migrations/` はそのまま使われます）。

```bash
# 初回のみ
npx supabase init                                # supabase/config.toml を生成
npx supabase login
npx supabase link --project-ref <project-ref>   # URL の https://<project-ref>.supabase.co

# migrations/ を順に適用
npx supabase db push
```

`supabase/.temp/` は CLI が生成する作業ディレクトリで、`.gitignore` 済みです。

### 既存行の制約検証（任意）

`NOT VALID` で追加した制約は新規行のみを検証します。既存行も検証したい場合は次を実行します
（条件を満たさない行があると失敗します）。

```sql
alter table public.vehicles     validate constraint vehicles_type_check;
alter table public.vehicles     validate constraint vehicles_user_id_fkey;
alter table public.fuel_records validate constraint fuel_records_user_id_fkey;
-- 0004
alter table public.fuel_records validate constraint fuel_records_fuel_type_check;
alter table public.fuel_records validate constraint fuel_records_memo_length_check;
alter table public.vehicles     validate constraint vehicles_distance_mode_check;
alter table public.vehicles     validate constraint vehicles_default_fuel_type_check;
```

---

## 2. RLS が有効か確認する

SQL Editor で次を実行し、すべて `rowsecurity = true` であることを確認します。

```sql
select schemaname, tablename, rowsecurity
  from pg_tables
 where schemaname = 'public'
   and tablename in ('users', 'vehicles', 'fuel_records', 'keepalive');
```

Dashboard の **Table Editor**（各テーブルの "RLS enabled" 表示）と **Advisors → Security Advisor** でも確認できます。

### 【必須】ポリシーの監査

`0001` は **自分が作るポリシー名しか drop しません**。Dashboard で手作業で作った `using (true)` のようなポリシーが残っていると、
ポリシーは許可の OR 結合（permissive）なので **他ユーザーのデータにアクセスできてしまいます**。
マイグレーションの実行後に必ず次を実行してください。

```sql
select schemaname, tablename, policyname, roles, cmd, qual, with_check
  from pg_policies
 where schemaname = 'public'
 order by tablename, policyname;
```

`users` / `vehicles` / `fuel_records` のポリシーが **次の 12 本だけ** で、`keepalive` には **ポリシーが無い**
（関数経由でのみ更新）ことを確認します。

| テーブル | 本リポジトリが管理するポリシー（select / insert / update / delete） |
|---|---|
| `users` | `users_select_own`, `users_insert_own`, `users_update_own`, `users_delete_own` |
| `vehicles` | `vehicles_select_own`, `vehicles_insert_own`, `vehicles_update_own`, `vehicles_delete_own` |
| `fuel_records` | `fuel_records_select_own`, `fuel_records_insert_own`, `fuel_records_update_own`, `fuel_records_delete_own` |

これ以外のポリシーがあれば削除します（名前は監査クエリの `policyname` 列をそのまま使う）。

```sql
drop policy if exists "<余分なポリシー名>" on public.<テーブル名>;
```

ポリシーは `(select auth.jwt()->>'sub') = user_id`（`users` は `= id`）で行を絞り込みます。
`fuel_records` の insert / update は、さらに `vehicle_id` が `null` か自分の車両であることを確認します。

---

## 3. Clerk JWT テンプレートの要件

アプリは Clerk の JWT テンプレート **`supabase`** で発行したトークンで PostgREST にアクセスします
（仕組みは [docs/architecture.md 7 章](../docs/architecture.md#7-認証)）。
Clerk Dashboard → **JWT Templates → `supabase`** が次を満たしている必要があります。

- 署名鍵 = Supabase の JWT Secret（Project Settings → API → JWT Secret）
- Claims に `"role": "authenticated"` を含める（無いと anon 扱いになり、`0001` で anon の権限を revoke しているため全クエリが権限エラー）
- `sub`（= Clerk userId `user_xxx`）・`exp`・`iat` は Clerk が自動で付与する

Claims の例:

```json
{ "role": "authenticated", "email": "{{user.primary_email_address}}" }
```

設定に誤りがあるときの症状と対処は [docs/operations.md 5 章](../docs/operations.md#5-トラブルシューティング) を参照してください。

---

## 4. バックアップ

Free プランには自動バックアップがありません。定期的に SQL Editor / Table Editor から CSV でエクスポートするか、
`pg_dump` を使ってください。

```bash
# 接続文字列は Project Settings → Database → Connection string (URI)
pg_dump "<connection-uri>" --schema=public --data-only -t vehicles -t fuel_records > backup.sql
```

バックアップファイルには個人の給油記録が含まれます。リポジトリにはコミットしないでください（`csv/` は `.gitignore` 済み）。
