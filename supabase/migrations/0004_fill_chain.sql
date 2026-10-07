-- =============================================================================
-- FuelLens: オドメーターモード・部分給油・記録漏れ・燃料種別・メモ (fill chain)
-- =============================================================================
-- 仕様: docs/design-fill-chain.md。計算は lib/fillChain.ts の applyFillChain が正本。
--
-- このファイルは「冪等」です。何度実行しても安全です。
--   * 列は add column if not exists で追加する (既存の列は型・既定値とも変更しない)
--   * 既定値は定数なので、PostgreSQL 11 以降では列の追加でテーブルは書き換わらない
--     (既存行は既定値として読まれる。update による既存データの書き換えはしない)
--   * CHECK 制約は pg_constraint を確認してから NOT VALID で追加する (新規行・更新行のみ検証)。
--     既存行の検証は supabase/README.md 参照
--
-- RLS ポリシーは行単位なので、列の追加による変更は不要 (0001 / 0003 のまま)。
--
-- 【適用順】 アプリが新しい列を送る前 (UI フェーズのデプロイ前) に適用すること。
-- 適用前の DB に新しい列を送ると PostgREST が「列が無い」エラー (PGRST204) を返す。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. fuel_records
-- -----------------------------------------------------------------------------
alter table public.fuel_records add column if not exists odometer        numeric;
alter table public.fuel_records add column if not exists is_full         boolean not null default true;
alter table public.fuel_records add column if not exists missed_previous boolean not null default false;
alter table public.fuel_records add column if not exists fuel_type       text;
alter table public.fuel_records add column if not exists memo            text;

comment on column public.fuel_records.odometer        is '給油時の積算距離 (km)。オドメーターモードの車両では必須入力。null = 未入力';
comment on column public.fuel_records.is_full         is '満タン給油か。false = 部分給油 (燃費は次の満タン給油でまとめて計算する)';
comment on column public.fuel_records.missed_previous is 'この給油の前に記録し忘れた給油がある。true なら区間が信頼できないので連鎖を切る';
comment on column public.fuel_records.fuel_type       is '燃料種別: regular / premium / diesel / other。null = 未指定';
comment on column public.fuel_records.memo            is '自由記述のメモ (200 文字まで)';
comment on column public.fuel_records.total_distance  is '区間距離 (km)。トリップモードは入力値、オドメーターモードは odometer の差分 (アプリが読み取り時に再計算する)';
comment on column public.fuel_records.fuel_efficiency is '燃費 (km/L)。保存時点の値。アプリは読み取り時に連鎖計算で再計算する (部分給油は null)';

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname  = 'fuel_records_fuel_type_check'
       and conrelid = 'public.fuel_records'::regclass
  ) then
    alter table public.fuel_records
      add constraint fuel_records_fuel_type_check
      check (fuel_type is null or fuel_type in ('regular', 'premium', 'diesel', 'other')) not valid;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname  = 'fuel_records_memo_length_check'
       and conrelid = 'public.fuel_records'::regclass
  ) then
    alter table public.fuel_records
      add constraint fuel_records_memo_length_check
      check (memo is null or char_length(memo) <= 200) not valid;
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- 2. vehicles
-- -----------------------------------------------------------------------------
alter table public.vehicles add column if not exists distance_mode     text not null default 'trip';
alter table public.vehicles add column if not exists default_fuel_type text;

comment on column public.vehicles.distance_mode     is '距離の入力方式: trip (トリップメーターの区間距離を入力) / odometer (積算距離を入力し差分で区間を出す)';
comment on column public.vehicles.default_fuel_type is '新規記録の燃料種別の初期値 (regular / premium / diesel / other)。null = 未指定';

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname  = 'vehicles_distance_mode_check'
       and conrelid = 'public.vehicles'::regclass
  ) then
    alter table public.vehicles
      add constraint vehicles_distance_mode_check
      check (distance_mode in ('trip', 'odometer')) not valid;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname  = 'vehicles_default_fuel_type_check'
       and conrelid = 'public.vehicles'::regclass
  ) then
    alter table public.vehicles
      add constraint vehicles_default_fuel_type_check
      check (default_fuel_type is null or default_fuel_type in ('regular', 'premium', 'diesel', 'other')) not valid;
  end if;
end
$$;

-- PostgREST のスキーマキャッシュを更新し、新しい列をすぐに API から使えるようにする
notify pgrst, 'reload schema';
