-- =============================================================================
-- FuelLens: 記録の入口 (fuel_records.source)
-- =============================================================================
-- どの経路で記録が作られたか (scan / manual / calc / import / restore ...) を残す、利用状況の計測用の列。
-- 画面には出さず、燃費の計算にも使わない。集計は supabase/runbooks/weekly_metrics.sql の 4。
-- 値の一覧と意味は lib/types.ts の RecordSource。値を増やしても DB の変更は要らない (text + 長さの制限だけ)。
--
-- このファイルは「冪等」です。何度実行しても安全です。
--   * 列は add column if not exists で追加する (既存の列は型・既定値とも変更しない)
--   * 既定値は無し (null)。既存行は書き換えず、null = 不明として読まれる
--   * CHECK 制約は pg_constraint を確認してから NOT VALID で追加する (新規行・更新行のみ検証)
--
-- RLS ポリシーは行単位なので、列の追加による変更は不要 (0001 / 0003 のまま)。
--
-- 【適用順】 アプリが source を送る前 (このリリースのデプロイ前) に適用すること。
-- 適用前の DB に source を送ると PostgREST が「列が無い」エラー (PGRST204) を返し、記録を保存できない。
-- =============================================================================

alter table public.fuel_records add column if not exists source text;

comment on column public.fuel_records.source is '記録の入口: scan / manual / calc / import / restore など。null = 不明 (0005 より前の記録)。計測用で、表示・計算には使わない';

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname  = 'fuel_records_source_length_check'
       and conrelid = 'public.fuel_records'::regclass
  ) then
    alter table public.fuel_records
      add constraint fuel_records_source_length_check
      check (source is null or char_length(source) <= 20) not valid;
  end if;
end
$$;

-- PostgREST のスキーマキャッシュを更新し、新しい列をすぐに API から使えるようにする
notify pgrst, 'reload schema';
