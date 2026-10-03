-- =============================================================================
-- FuelLens: スキーマ定義 + Row Level Security (RLS)
-- =============================================================================
-- このファイルは「冪等」です。新規プロジェクトにも、すでにテーブルが存在する
-- 本番プロジェクトにも、何度実行しても安全なように書かれています。
--   * create table if not exists / add column if not exists / create index if not exists
--   * 制約は pg_constraint を確認してから追加
--   * ポリシーは drop policy if exists → create policy
--
-- -----------------------------------------------------------------------------
-- 認証方式について (Clerk JWT テンプレート "supabase")
-- -----------------------------------------------------------------------------
-- フロントエンドは anon キー + Clerk が発行した JWT (Authorization: Bearer ...) で
-- PostgREST にアクセスします。RLS が正しく働くには Clerk 側の JWT テンプレートが
-- 次を満たしている必要があります。
--
--   1. 署名: Supabase プロジェクトの JWT Secret (HS256) で署名されていること
--      (Supabase Dashboard > Project Settings > API > JWT Secret)
--   2. `sub` クレーム: Clerk の userId (例: "user_xxxxxxxx") が入っていること
--      → 下記ポリシーは (select auth.jwt()->>'sub') = user_id で照合します
--   3. `role` クレーム: "authenticated" であること
--      → これが無いと PostgREST は anon ロールで実行し、本ファイルで anon の権限を
--        全て revoke しているため、すべてのクエリが権限エラーになります
--
--   Clerk の JWT テンプレート例 (Claims):
--     { "role": "authenticated", "email": "{{user.primary_email_address}}" }
--     ※ sub / exp / iat は Clerk が自動付与します
--
-- 【推奨される将来の移行先】
--   Supabase は現在 Clerk を「Third-Party Auth」としてネイティブにサポートして
--   います (Dashboard > Authentication > Sign In / Providers > Third-Party Auth)。
--   この方式では Supabase の JWT Secret を Clerk に共有する必要がなく、Clerk の
--   セッショントークンをそのまま supabase-js の accessToken として渡せます。
--   その場合も `sub` と `role: "authenticated"` の前提は変わらないため、本ファイルの
--   ポリシーはそのまま流用できます。
-- =============================================================================

-- gen_random_uuid() は PostgreSQL 13 以降は組み込みですが、念のため有効化します。
create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 1. users  (Clerk ユーザーのミラー。components/UserSync.tsx が upsert する)
-- -----------------------------------------------------------------------------
create table if not exists public.users (
  id          text primary key,          -- Clerk userId (user_xxx)
  email       text,
  updated_at  timestamptz
);

alter table public.users add column if not exists email      text;
alter table public.users add column if not exists updated_at timestamptz;

-- email は null 許容 (UserSync.tsx はメールアドレスが無いユーザーでは null を送る)。
-- 既に null 許容なら no-op。
alter table public.users alter column email drop not null;

comment on table  public.users            is 'Clerk ユーザーのミラー (id = Clerk userId)';
comment on column public.users.updated_at is 'UserSync.tsx が upsert 時に更新';

-- -----------------------------------------------------------------------------
-- 2. vehicles  (lib/useVehicles.ts)
-- -----------------------------------------------------------------------------
create table if not exists public.vehicles (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null,              -- Clerk userId
  name        text not null,
  type        text not null,              -- 'car' | 'bike'
  created_at  timestamptz not null default now()
);

alter table public.vehicles add column if not exists created_at timestamptz default now();

-- type の CHECK 制約。既存データに想定外の値があっても移行が失敗しないよう
-- NOT VALID で追加し、新規行のみ検証します。既存行の検証は supabase/README.md 参照。
do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname  = 'vehicles_type_check'
       and conrelid = 'public.vehicles'::regclass
  ) then
    alter table public.vehicles
      add constraint vehicles_type_check
      check (type in ('car', 'bike')) not valid;
  end if;
end
$$;

comment on table public.vehicles is 'ユーザーの車両 (車/バイク)';

-- -----------------------------------------------------------------------------
-- 3. fuel_records  (lib/useFuelRecords.ts)
-- -----------------------------------------------------------------------------
-- date 列は本番のバックアップ JSON が "YYYY-MM-DD" で出力されているため `date` 型と
-- 推定しています。既存テーブルがある場合、この DDL は型を変更しません。
create table if not exists public.fuel_records (
  id               uuid primary key default gen_random_uuid(),
  user_id          text not null,         -- Clerk userId
  date             date not null,         -- 給油日
  total_distance   numeric,               -- 走行距離 (km, トリップメーター)
  fuel_amount      numeric,               -- 給油量 (L)
  gas_station      text,
  price_per_unit   numeric,               -- 単価 (円/L)
  total_cost       numeric,               -- 支払総額 (円)
  fuel_efficiency  numeric,               -- 燃費 (km/L)
  created_at       timestamptz not null default now(),
  vehicle_id       uuid                   -- null = 未分類 (ローカルから移行した記録など)
);

alter table public.fuel_records add column if not exists vehicle_id uuid;
alter table public.fuel_records add column if not exists created_at timestamptz default now();

-- 孤児レコードの掃除 (外部キー追加前に必ず実行)。
-- 以前のアプリは車両削除時に vehicles 行だけを消していたため、既存の本番 DB には
-- 存在しない vehicle_id を指す fuel_records が残っている可能性がある。そのまま FK を
-- 追加すると "violates foreign key constraint" でスクリプト全体が失敗するので、
-- 先に vehicle_id を null にして「未分類」(既定車両選択時に表示される) にする。
-- 対象が無ければ何も更新しない (冪等)。
update public.fuel_records r
   set vehicle_id = null
 where r.vehicle_id is not null
   and not exists (select 1 from public.vehicles v where v.id = r.vehicle_id);

-- vehicles への外部キー。
-- アプリ (lib/useVehicles.ts deleteVehicle) は UI の文言「関連する給油記録も削除されます」どおり、
-- 車両削除の前に紐づく給油記録を削除する。DB 側でもそれを保証する安全網として ON DELETE CASCADE にする
-- (以前は set null で「未分類化」していた。既存の制約が cascade 以外なら張り直す)。
do $$
declare
  v_deltype "char";
begin
  select confdeltype
    into v_deltype
    from pg_constraint
   where conname  = 'fuel_records_vehicle_id_fkey'
     and conrelid = 'public.fuel_records'::regclass;

  if found and v_deltype <> 'c' then
    alter table public.fuel_records drop constraint fuel_records_vehicle_id_fkey;
  end if;

  if not found or v_deltype <> 'c' then
    alter table public.fuel_records
      add constraint fuel_records_vehicle_id_fkey
      foreign key (vehicle_id) references public.vehicles (id)
      on delete cascade;
  end if;
end
$$;

comment on table  public.fuel_records            is '給油記録 (満タン法)';
comment on column public.fuel_records.vehicle_id is 'null は未分類 (既定車両選択時のみ表示)。車両削除時は記録も cascade 削除される';

-- -----------------------------------------------------------------------------
-- 4. インデックス
-- -----------------------------------------------------------------------------
create index if not exists fuel_records_user_vehicle_date_idx
  on public.fuel_records (user_id, vehicle_id, date desc);

create index if not exists vehicles_user_created_idx
  on public.vehicles (user_id, created_at);

-- -----------------------------------------------------------------------------
-- 5. RLS 有効化 + 権限
-- -----------------------------------------------------------------------------
alter table public.users        enable row level security;
alter table public.vehicles     enable row level security;
alter table public.fuel_records enable row level security;

-- 未ログイン (anon) からは一切触れないようにする。
-- アプリは未ログイン時 localStorage のみを使うため anon 権限は不要。
revoke all on table public.users, public.vehicles, public.fuel_records from anon;

-- authenticated には DML を許可 (行の絞り込みは下記ポリシーが行う)
grant select, insert, update, delete
  on table public.users, public.vehicles, public.fuel_records
  to authenticated;

-- -----------------------------------------------------------------------------
-- 6. ポリシー
--    (select auth.jwt()->>'sub') と書くことで、クエリごとに 1 回だけ評価される
--    (initplan 化) ため、行数が多くても高速です。
--
--    【重要】このスクリプトは自分が作るポリシー名 (下記 12 本) しか drop しません。
--    Dashboard で手作業で作られた `using (true)` のようなポリシーが残っていると、
--    ポリシーは許可の OR 結合 (permissive) なので他ユーザーのデータにアクセスできて
--    しまいます。実行後に必ず次の監査クエリで一覧を確認し、下記 12 本以外のポリシーが
--    users / vehicles / fuel_records にあれば drop policy してください
--    (手順は supabase/README.md「2. RLS が有効か確認する」)。
--
--    select schemaname, tablename, policyname, roles, cmd, qual, with_check
--      from pg_policies
--     where schemaname = 'public'
--     order by tablename;
--
--    本スクリプトが管理するポリシー名:
--      users_select_own,        users_insert_own,        users_update_own,        users_delete_own,
--      vehicles_select_own,     vehicles_insert_own,     vehicles_update_own,     vehicles_delete_own,
--      fuel_records_select_own, fuel_records_insert_own, fuel_records_update_own, fuel_records_delete_own
-- -----------------------------------------------------------------------------

-- users: 自分の行 (id = sub) のみ
drop policy if exists users_select_own on public.users;
create policy users_select_own on public.users
  for select to authenticated
  using ((select auth.jwt()->>'sub') = id);

drop policy if exists users_insert_own on public.users;
create policy users_insert_own on public.users
  for insert to authenticated
  with check ((select auth.jwt()->>'sub') = id);

drop policy if exists users_update_own on public.users;
create policy users_update_own on public.users
  for update to authenticated
  using      ((select auth.jwt()->>'sub') = id)
  with check ((select auth.jwt()->>'sub') = id);

drop policy if exists users_delete_own on public.users;
create policy users_delete_own on public.users
  for delete to authenticated
  using ((select auth.jwt()->>'sub') = id);

-- vehicles: user_id = sub
drop policy if exists vehicles_select_own on public.vehicles;
create policy vehicles_select_own on public.vehicles
  for select to authenticated
  using ((select auth.jwt()->>'sub') = user_id);

drop policy if exists vehicles_insert_own on public.vehicles;
create policy vehicles_insert_own on public.vehicles
  for insert to authenticated
  with check ((select auth.jwt()->>'sub') = user_id);

drop policy if exists vehicles_update_own on public.vehicles;
create policy vehicles_update_own on public.vehicles
  for update to authenticated
  using      ((select auth.jwt()->>'sub') = user_id)
  with check ((select auth.jwt()->>'sub') = user_id);

drop policy if exists vehicles_delete_own on public.vehicles;
create policy vehicles_delete_own on public.vehicles
  for delete to authenticated
  using ((select auth.jwt()->>'sub') = user_id);

-- fuel_records: user_id = sub
drop policy if exists fuel_records_select_own on public.fuel_records;
create policy fuel_records_select_own on public.fuel_records
  for select to authenticated
  using ((select auth.jwt()->>'sub') = user_id);

drop policy if exists fuel_records_insert_own on public.fuel_records;
create policy fuel_records_insert_own on public.fuel_records
  for insert to authenticated
  with check ((select auth.jwt()->>'sub') = user_id);

drop policy if exists fuel_records_update_own on public.fuel_records;
create policy fuel_records_update_own on public.fuel_records
  for update to authenticated
  using      ((select auth.jwt()->>'sub') = user_id)
  with check ((select auth.jwt()->>'sub') = user_id);

drop policy if exists fuel_records_delete_own on public.fuel_records;
create policy fuel_records_delete_own on public.fuel_records
  for delete to authenticated
  using ((select auth.jwt()->>'sub') = user_id);
