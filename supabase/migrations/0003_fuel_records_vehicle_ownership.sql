-- =============================================================================
-- FuelLens: fuel_records の vehicle_id 所有者チェック (RLS)
-- =============================================================================
-- 0001_schema_and_rls.sql 適用済みの本番 DB に、fuel_records の insert / update ポリシーの
-- 強化だけを単独で適用するためのファイルです (0001 の該当部分と同じ定義。冪等)。
--
-- 変更内容: user_id = sub に加えて、vehicle_id が null (未分類) か「自分の車両」を指す場合だけ
-- 書き込みを許可する。外部キーは車両の存在しか確認しないため、他ユーザーの vehicle_id を指す
-- 記録を作れないよう RLS で所有者を確認する。ポリシー名は変更しない。
-- =============================================================================

drop policy if exists fuel_records_insert_own on public.fuel_records;
create policy fuel_records_insert_own on public.fuel_records
  for insert to authenticated
  with check (
    (select auth.jwt()->>'sub') = user_id
    and (
      vehicle_id is null
      or exists (
        select 1
          from public.vehicles v
         where v.id = fuel_records.vehicle_id
           and v.user_id = (select auth.jwt()->>'sub')
      )
    )
  );

drop policy if exists fuel_records_update_own on public.fuel_records;
create policy fuel_records_update_own on public.fuel_records
  for update to authenticated
  using ((select auth.jwt()->>'sub') = user_id)
  with check (
    (select auth.jwt()->>'sub') = user_id
    and (
      vehicle_id is null
      or exists (
        select 1
          from public.vehicles v
         where v.id = fuel_records.vehicle_id
           and v.user_id = (select auth.jwt()->>'sub')
      )
    )
  );
