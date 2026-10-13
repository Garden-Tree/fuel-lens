-- =============================================================================
-- Clerk の開発インスタンス → 本番インスタンス切り替え後のユーザー ID 付け替え
-- （docs/auth-production.md 5 章）
--
-- 本番インスタンスでは同じ Google アカウント / メールアドレスでも別の user_... ID になる。
-- 本番でログインし直したユーザーについて、同じメールアドレスの旧 ID のデータ（車両・記録）を新 ID に移す。
--
-- 使い方（Supabase の SQL Editor。postgres ロールなので RLS は迂回される）:
--   1. 事前に設定画面からバックアップ（JSON）を取る
--   2. 「1. 確認」だけを実行し、対応（old_id → new_id）と件数を目視で確認する
--   3. 「2. 付け替え」を実行する（1 つのトランザクション。途中で失敗すれば何も変わらない）
--   4. 「3. 結果の確認」を実行する
-- 何度実行しても安全（付け替え済みのユーザーは対象にならない）。
-- まだ本番でログインしていないユーザーは対象にならないので、ログインしたあとにもう一度実行する。
-- =============================================================================

-- 1. 確認: 同じメールアドレスで、旧 ID（データあり）と新 ID（本番でログイン済み）の組
with pairs as (
  select o.id as old_id, n.id as new_id, lower(o.email) as email
  from public.users o
  join public.users n
    on lower(n.email) = lower(o.email) and n.id <> o.id
  where o.email is not null
    and exists (select 1 from public.vehicles v where v.user_id = o.id)
    -- 新 ID 側は「記録が 1 件もない」ものだけ（付け替え済み・使用中の ID を旧 ID と取り違えない）
    and not exists (select 1 from public.fuel_records r where r.user_id = n.id)
)
select p.*,
  (select count(*) from public.vehicles v where v.user_id = p.old_id)     as old_vehicles,
  (select count(*) from public.fuel_records r where r.user_id = p.old_id) as old_records,
  (select count(*) from public.vehicles v where v.user_id = p.new_id)     as new_empty_vehicles
from pairs p;

-- 2. 付け替え
begin;

create temporary table remap_pairs on commit drop as
  select o.id as old_id, n.id as new_id
  from public.users o
  join public.users n
    on lower(n.email) = lower(o.email) and n.id <> o.id
  where o.email is not null
    and exists (select 1 from public.vehicles v where v.user_id = o.id)
    and not exists (select 1 from public.fuel_records r where r.user_id = n.id);

-- 新 ID でログインした直後にアプリが自動作成した空の車両（記録なし）を消す（旧 ID の車両を持ってくるため）
delete from public.vehicles v
using remap_pairs p
where v.user_id = p.new_id
  and not exists (select 1 from public.fuel_records r where r.vehicle_id = v.id);

update public.vehicles v     set user_id = p.new_id from remap_pairs p where v.user_id = p.old_id;
update public.fuel_records r set user_id = p.new_id from remap_pairs p where r.user_id = p.old_id;

-- 子を付け替えてから旧 users 行を消す（先に消すと ON DELETE CASCADE で記録が消える）
delete from public.users u using remap_pairs p where u.id = p.old_id;

commit;

-- 3. 結果の確認: ユーザーごとの車両・記録の件数
select u.id, u.email,
  (select count(*) from public.vehicles v where v.user_id = u.id)     as vehicles,
  (select count(*) from public.fuel_records r where r.user_id = u.id) as records
from public.users u
order by records desc;
