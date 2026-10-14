-- =============================================================================
-- 週次の利用状況（集客の効果測定用）。Supabase の SQL Editor で実行する。読み取りのみ。
-- 個人を特定する情報（メールアドレス・ID）は出さず、件数だけを集計する。
-- 運用メモ: docs/operations.md「週次の利用状況」
-- =============================================================================

-- 1. 全体の件数
select
  (select count(*) from public.users)                                         as users,
  (select count(distinct user_id) from public.fuel_records)                   as users_with_records,
  (select count(*) from public.vehicles)                                      as vehicles,
  (select count(*) from public.fuel_records)                                  as records;

-- 2. 週ごとの推移（直近 12 週。月曜始まり）
--    new_users = その週に最初の車両ができたユーザー（users に作成日時が無いため、最初の車両の作成日時で代用）
--    active_users = その週に記録を追加したユーザー、records_added = その週に追加された記録
with weeks as (
  select generate_series(
    date_trunc('week', now()) - interval '11 weeks',
    date_trunc('week', now()),
    interval '1 week'
  ) as week_start
),
first_seen as (
  select user_id, min(created_at) as first_at from public.vehicles group by user_id
)
select
  to_char(w.week_start, 'YYYY-MM-DD') as week,
  (select count(*) from first_seen f
     where f.first_at >= w.week_start and f.first_at < w.week_start + interval '1 week')         as new_users,
  (select count(distinct r.user_id) from public.fuel_records r
     where r.created_at >= w.week_start and r.created_at < w.week_start + interval '1 week')     as active_users,
  (select count(*) from public.fuel_records r
     where r.created_at >= w.week_start and r.created_at < w.week_start + interval '1 week')     as records_added
from weeks w
order by w.week_start;

-- 3. 定着（記録を 2 回以上つけたユーザーの割合）
with per_user as (
  select user_id, count(*) as n from public.fuel_records group by user_id
)
select
  count(*)                                        as users_with_records,
  count(*) filter (where n >= 2)                  as users_with_2plus,
  count(*) filter (where n >= 5)                  as users_with_5plus,
  round(100.0 * count(*) filter (where n >= 2) / nullif(count(*), 0), 1) as pct_2plus
from per_user;
