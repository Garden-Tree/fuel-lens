-- =============================================================================
-- 週次の利用状況（集客の効果測定用）。Supabase の SQL Editor で実行する。読み取りのみ（一時テーブルを除く）。
-- 個人を特定する情報（メールアドレス・ID）は出さず、件数だけを集計する。
-- 運用メモ: docs/operations.md「週次の利用状況」
-- =============================================================================

-- 0. オーナー自身（内部）のアカウントを除外する設定。ここだけ編集する。
--    オーナーの本番ログインと、プレビュー/開発の Clerk インスタンスで作ったテスト用アカウントは
--    同じ Supabase DB に書き込むため、除外しないと数字が汚れる。
--    id は下の「0b」で調べる。実際の id はリポジトリにコミットしない（編集したら戻してから commit する）。
--
--    方式: 一時テーブル（temp table）。SQL Editor は psql 変数（\set）を使えず、各クエリが別リクエストになることもあるため、
--    「0 の 2 文 + 実行したいクエリ」を一緒に選択して実行する（SQL Editor は最後の文の結果だけを表示する）。
--    一時テーブルは接続（セッション）が終われば消える。drop table if exists で何度実行しても同じ結果になる。
--    プレースホルダのままでも一致する id が無いだけで、クエリは全ユーザーを数えて動く。
drop table if exists pg_temp.internal_users;
create temp table internal_users as
select unnest(array[
  '<オーナーの user_id（本番の Google ログイン）>',
  '<オーナーの user_id（プレビューのテストアカウント）>'
]::text[]) as user_id;

-- 0b. （任意）オーナーの user_id を探す。0 の 2 文と一緒に選ばずに、この select だけを単独で実行する。
--     メールアドレスは出さない。user_id・最初の記録の日・記録数だけ。最初の記録が古い / 記録が多い順に並ぶので、自分のものを選ぶ。
-- select
--   user_id,
--   min(created_at)::date as first_record_date,
--   count(*)              as record_count
-- from public.fuel_records
-- group by user_id
-- order by min(created_at) asc, count(*) desc
-- limit 10;

-- 以降のクエリはすべて internal_users の user_id を除外する（上の 0 を一緒に実行すること）。

-- 1. 全体の件数
select
  (select count(*) from public.users where id not in (select user_id from internal_users)) as users,
  (select count(distinct user_id) from public.fuel_records where user_id not in (select user_id from internal_users)) as users_with_records,
  (select count(*) from public.vehicles where user_id not in (select user_id from internal_users)) as vehicles,
  (select count(*) from public.fuel_records where user_id not in (select user_id from internal_users)) as records;

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
  select user_id, min(created_at) as first_at from public.vehicles
  where user_id not in (select user_id from internal_users) group by user_id
)
select
  to_char(w.week_start, 'YYYY-MM-DD') as week,
  (select count(*) from first_seen f
     where f.first_at >= w.week_start and f.first_at < w.week_start + interval '1 week')         as new_users,
  (select count(distinct r.user_id) from public.fuel_records r
     where r.created_at >= w.week_start and r.created_at < w.week_start + interval '1 week'
       and r.user_id not in (select user_id from internal_users))     as active_users,
  (select count(*) from public.fuel_records r
     where r.created_at >= w.week_start and r.created_at < w.week_start + interval '1 week'
       and r.user_id not in (select user_id from internal_users))     as records_added
from weeks w
order by w.week_start;

-- 3. 定着（記録を 2 回以上つけたユーザーの割合）
with per_user as (
  select user_id, count(*) as n from public.fuel_records where user_id not in (select user_id from internal_users) group by user_id
)
select
  count(*)                                        as users_with_records,
  count(*) filter (where n >= 2)                  as users_with_2plus,
  count(*) filter (where n >= 5)                  as users_with_5plus,
  round(100.0 * count(*) filter (where n >= 2) / nullif(count(*), 0), 1) as pct_2plus
from per_user;

-- 4. 記録の入口（fuel_records.source。0005 で追加。どの経路で記録が作られたか）
--    source: scan = 撮影・アルバム（1 枚） / batch = 写真の一括読み取り / pair = レシートとメーターの 2 枚の読み取り /
--            manual = 手動入力 / calc = 燃費計算ページから引き継いだ手動入力 /
--            import = Fuelio・CSV の取り込み / restore = バックアップの復元 / unknown = 0005 より前の記録（null）
--    注意: 取り込み・復元の記録の created_at は元の記録の日時のまま（取り込んだ週ではなく記録した週に入る）。
--    4a. 直近 12 週 × 入口ごとの記録数（月曜始まり。2 と同じく created_at の週で数える）
with weeks as (
  select generate_series(
    date_trunc('week', now()) - interval '11 weeks',
    date_trunc('week', now()),
    interval '1 week'
  ) as week_start
)
select
  to_char(w.week_start, 'YYYY-MM-DD')        as week,
  coalesce(r.source, 'unknown')              as source,
  count(r.id)                                as records
from weeks w
join public.fuel_records r
  on r.created_at >= w.week_start and r.created_at < w.week_start + interval '1 week'
 where r.user_id not in (select user_id from internal_users)
group by w.week_start, coalesce(r.source, 'unknown')
order by w.week_start, source;

-- 4b. 最初の記録の入口ごとのユーザー数（どの経路から使い始めた人が多いか）
--     最初の記録 = そのユーザーの created_at が最も古い記録（同時刻は id が小さい方）。
--     first_source ごとに、ユーザー数と、そのうち記録が 2 回以上のユーザー（定着）を出す
with ranked as (
  select
    user_id,
    coalesce(source, 'unknown') as first_source,
    row_number() over (partition by user_id order by created_at asc, id asc) as rn,
    count(*)     over (partition by user_id)                                 as n
  from public.fuel_records
  where user_id not in (select user_id from internal_users)
)
select
  first_source,
  count(*)                                   as users,
  count(*) filter (where n >= 2)             as users_with_2plus,
  round(100.0 * count(*) filter (where n >= 2) / nullif(count(*), 0), 1) as pct_2plus
from ranked
where rn = 1
group by first_source
order by users desc;
