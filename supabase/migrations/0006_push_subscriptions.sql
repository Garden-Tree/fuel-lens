-- =============================================================================
-- FuelLens: 給油のお知らせ (Web Push) の購読 (push_subscriptions)
-- =============================================================================
-- 設定画面の「給油のお知らせ」をオンにした端末 (ブラウザ / ホーム画面の PWA) ごとの PushSubscription を保存する。
-- 送信は Vercel Cron → GET /api/push/reminders が service_role キーで行う (RLS を迂回して全員分を読む)。
-- 判定の規則は lib/push/reminder.ts、全体は docs/architecture.md「給油のお知らせ」。
--
-- このファイルは「冪等」です。何度実行しても安全です。
--   * create table if not exists / create index if not exists
--   * CHECK 制約はテーブル定義の中だけ (既存テーブルには触れない)
--   * ポリシーは drop policy if exists → create policy
--
-- 権限:
--   * anon: なし (revoke all)
--   * authenticated: select / insert / delete のみ (自分の行だけ。RLS)。update は与えない
--     (enabled の無効化と last_notified_* はサーバー (service_role) だけが書く。利用者がオフにするときは行を削除する)
--   * service_role: RLS を迂回する (Supabase の既定)
--
-- アカウント削除: user_id → users(id) の外部キーが ON DELETE CASCADE なので、users 行の削除で購読も消える
-- (lib/data/accountDeletion.ts の deleteOwnData は users 行を削除する)。
--
-- 【適用順】 NEXT_PUBLIC_VAPID_PUBLIC_KEY を設定して設定画面に「給油のお知らせ」を出す前に適用すること。
-- 未適用のまま鍵だけ設定すると、オンにしたときの保存が失敗する (画面には日本語のエラーが出る。他の機能には影響しない)。
-- =============================================================================

create extension if not exists pgcrypto;

create table if not exists public.push_subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  text not null references public.users (id) on delete cascade,  -- Clerk userId
  endpoint                 text not null,                                                   -- PushSubscription.endpoint
  p256dh                   text not null,                                                   -- keys.p256dh
  auth                     text not null,                                                   -- keys.auth
  enabled                  boolean not null default true,                                   -- 404 / 410 でサーバーが false にする
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  last_notified_record_id  uuid,                                                            -- 最後にお知らせを送った記録 (同じ記録に 2 回送らない)
  last_notified_at         timestamptz,
  constraint push_subscriptions_user_endpoint_key unique (user_id, endpoint),
  constraint push_subscriptions_endpoint_check check (endpoint like 'https://%' and char_length(endpoint) <= 1000),
  constraint push_subscriptions_keys_check check (char_length(p256dh) between 1 and 200 and char_length(auth) between 1 and 100)
);

comment on table  public.push_subscriptions                         is '給油のお知らせ (Web Push) の購読。端末ごとに 1 行';
comment on column public.push_subscriptions.enabled                 is 'false = プッシュサービスが 404 / 410 を返した (もう届かない)。送信の対象外';
comment on column public.push_subscriptions.last_notified_record_id is '最後にお知らせを送ったときの最新の記録。同じ記録には 2 回送らない';

-- Cron が有効な購読だけを読む
create index if not exists push_subscriptions_enabled_user_idx
  on public.push_subscriptions (user_id)
  where enabled;

-- -----------------------------------------------------------------------------
-- RLS + 権限
-- -----------------------------------------------------------------------------
alter table public.push_subscriptions enable row level security;

revoke all on table public.push_subscriptions from anon;
revoke all on table public.push_subscriptions from authenticated;
grant select, insert, delete on table public.push_subscriptions to authenticated;

--    本スクリプトが管理するポリシー名:
--      push_subscriptions_select_own, push_subscriptions_insert_own, push_subscriptions_delete_own
--    (update のポリシーは作らない。authenticated に update 権限も無い)

drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
create policy push_subscriptions_select_own on public.push_subscriptions
  for select to authenticated
  using ((select auth.jwt()->>'sub') = user_id);

drop policy if exists push_subscriptions_insert_own on public.push_subscriptions;
create policy push_subscriptions_insert_own on public.push_subscriptions
  for insert to authenticated
  with check (
    (select auth.jwt()->>'sub') = user_id
    and enabled
    and last_notified_record_id is null
    and last_notified_at is null
  );

drop policy if exists push_subscriptions_delete_own on public.push_subscriptions;
create policy push_subscriptions_delete_own on public.push_subscriptions
  for delete to authenticated
  using ((select auth.jwt()->>'sub') = user_id);

-- PostgREST のスキーマキャッシュを更新し、新しいテーブルをすぐに API から使えるようにする
notify pgrst, 'reload schema';
