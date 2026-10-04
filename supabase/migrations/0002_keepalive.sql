-- =============================================================================
-- FuelLens: Supabase Free プラン「7日間無操作で自動停止」対策用のハートビート
-- =============================================================================
-- Free プランのプロジェクトは DB へのアクセスが約 7 日間ほぼ無いと一時停止
-- (paused) され、API ゲートウェイが HTTP 540 を返すようになります。
-- 1 日に数回でも DB に書き込みがあれば停止しないため、
--   * Vercel Cron  → app/api/keepalive/route.ts → この関数 (RPC)
--   * GitHub Actions → PostgREST の /rest/v1/rpc/keepalive_ping を直接呼び出し
-- の 2 系統から keepalive_ping() を叩きます。
--
-- 冪等: 何度実行しても安全です。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ハートビートテーブル (常に id = 1 の 1 行だけ)
-- -----------------------------------------------------------------------------
create table if not exists public.keepalive (
  id         smallint primary key default 1 check (id = 1),
  last_ping  timestamptz not null default now(),
  source     text
);

comment on table public.keepalive is 'Supabase 自動停止対策のハートビート (1 行のみ)';

insert into public.keepalive (id, last_ping, source)
values (1, now(), 'migration')
on conflict (id) do nothing;

-- RLS を有効化し、ポリシーを一切作らない = PostgREST 経由ではテーブルに直接触れない。
-- 更新は下記の security definer 関数経由のみ。
alter table public.keepalive enable row level security;
revoke all on table public.keepalive from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. keepalive_ping(): ハートビートを更新して last_ping を返す
--    * security definer: 呼び出し元 (anon 等) に代わってテーブル所有者権限で実行
--    * set search_path = public: search_path ハイジャック対策
--    * 10 分以内の連続呼び出しは書き込みをスキップ (スロットル)。
--      anon キーは公開情報なので、連打されても WAL/ディスク消費が増えないようにする。
-- -----------------------------------------------------------------------------
create or replace function public.keepalive_ping(p_source text default 'cron')
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last timestamptz;
begin
  update public.keepalive
     set last_ping = now(),
         source    = left(coalesce(p_source, 'cron'), 64)
   where id = 1
     and last_ping < now() - interval '10 minutes'
  returning last_ping into v_last;

  if v_last is null then
    -- スロットル中 (更新なし) または行が無い場合
    select k.last_ping into v_last
      from public.keepalive k
     where k.id = 1;

    if v_last is null then
      -- 行が削除されていた場合は再作成
      insert into public.keepalive (id, last_ping, source)
      values (1, now(), left(coalesce(p_source, 'cron'), 64))
      on conflict (id) do nothing
      returning last_ping into v_last;
    end if;
  end if;

  return v_last;
end;
$$;

comment on function public.keepalive_ping(text)
  is 'ハートビートを更新 (10 分スロットル) して last_ping を返す。Free プラン自動停止対策。';

-- 関数は既定で public に execute が付与されるため、一度剥がしてから明示的に付与する
revoke execute on function public.keepalive_ping(text) from public;
grant  execute on function public.keepalive_ping(text) to anon, authenticated, service_role;
