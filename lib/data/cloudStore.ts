/**
 * ログイン時の保存先（Supabase）。RecordStore / VehicleStore の実装。
 *
 * ブラウザから anon キー + Clerk JWT で PostgREST に直接アクセスする（RLS で自分の行だけ）。
 * ここは「生の層」: 失敗は Supabase のエラー（HTTP ステータスを `status` に付けたもの）をそのまま投げる。
 * 障害の分類・閲覧専用の書き込みガード・日本語メッセージへの変換は withOutageHandling（withOutage.ts）が行う。
 * 例外として、保存前の検証（車両が未確定）は日本語の DataError を投げる。
 *
 * 既定車両の確保（ensureDefaultVehicle）と users 行の確保（ensureUserRow）もここに置き、移行処理（lib/migrateLocalData.ts）と共有する。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { withCrossTabLock } from "../crossTabLock";
import { normalizeTimestamp } from "../dates";
import { isDistanceMode, isFuelType, normalizeRecord, normalizeVehicle } from "../fillChain";
import { isUuid } from "../recordFilters";
import type { DistanceMode, FuelRecord, FuelType, Vehicle, VehicleType } from "../types";
import { pickRecordColumns, sanitizeVehicleSettings, vehiclePatchColumns } from "./columns";
import { DEFAULT_VEHICLE_NAME } from "./localStore";
import {
  DataError,
  PartialWriteError,
  VALIDATION_CODE,
  type DataStores,
  type RecordStore,
  type VehicleStore,
} from "./types";

/** addMany の 1 回の insert の件数 */
const INSERT_CHUNK = 100;
/** listAll の 1 ページの件数 */
const LIST_PAGE = 1000;

/** PostgrestError に HTTP ステータスを添えて投げ直すためのヘルパー */
export function withStatus<E extends object>(error: E, status: number | undefined): E & { status?: number } {
  const e = error as E & { status?: number };
  if (typeof e.status !== "number" && typeof status === "number") {
    try {
      e.status = status;
    } catch {
      // frozen な場合は無視
    }
  }
  return e;
}

// ------------------------------------------------------------------
// 車両の insert 行（移行処理と共有）
// ------------------------------------------------------------------

/** 車両の設定（0004 で追加した列）。値があるものだけを持ち、送信する */
export type VehicleSettingsColumns = { distance_mode?: DistanceMode; default_fuel_type?: FuelType };
/** 既定車両・移行する車両の種 */
export type VehicleSeed = { name: string; type: VehicleType } & VehicleSettingsColumns;

/** distance_mode / default_fuel_type のうち、有効な値のものだけを返す（null を含め無効なら送らず DB の既定値） */
export function vehicleSettingsColumns(item: { distance_mode?: unknown; default_fuel_type?: unknown }): VehicleSettingsColumns {
  const out: VehicleSettingsColumns = {};
  if (isDistanceMode(item.distance_mode)) out.distance_mode = item.distance_mode;
  if (isFuelType(item.default_fuel_type)) out.default_fuel_type = item.default_fuel_type;
  return out;
}

/** 車両の insert 行（設定は値があるものだけ） */
export function vehicleInsertRow(userId: string, v: VehicleSeed) {
  return { user_id: userId, name: v.name, type: v.type, ...vehicleSettingsColumns(v) };
}

// ------------------------------------------------------------------
// users 行と既定車両の確保（移行処理と共有）
// ------------------------------------------------------------------

const userRowInflight = new Map<string, Promise<void>>();

/**
 * users テーブルに userId の行があることを保証する（冪等）。
 *
 * 本番 DB では vehicles.user_id / fuel_records.user_id に users(id) への外部キー
 * （vehicles_user_id_fkey / fuel_records_user_id_fkey）があり、0001_schema_and_rls.sql も新規プロジェクトで
 * 同じ FK を作成する。そのため新規ユーザーの初回ログインで UserSync の upsert より先に車両・記録を
 * 挿入すると 23503（FK 違反）で失敗する。
 * id だけを ON CONFLICT DO NOTHING で挿入する（email などは UserSync が管理するので送らない）。
 * 成功した Promise はタブ内で userId ごとに使い回し、失敗時は破棄して次回再試行する。
 *
 * @throws Supabase エラー（status 付き）
 */
export function ensureUserRow(supabase: SupabaseClient, userId: string): Promise<void> {
  const existing = userRowInflight.get(userId);
  if (existing) return existing;

  const run = (async () => {
    const { error, status } = await supabase
      .from("users")
      .upsert({ id: userId }, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw withStatus(error, status);
  })();
  userRowInflight.set(userId, run);
  run.catch(() => {
    if (userRowInflight.get(userId) === run) userRowInflight.delete(userId);
  });
  return run;
}

/**
 * ロックを取らない内部実装。移行処理（ロック保持中）から呼ぶ。
 * `created` は既定車両をこの呼び出しで新規作成したかどうか。
 */
export async function ensureDefaultVehicleUnlocked(
  supabase: SupabaseClient,
  userId: string,
  seed?: VehicleSeed
): Promise<{ vehicles: Vehicle[]; created: boolean }> {
  const { data, error, status } = await supabase
    .from("vehicles")
    .select("*")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw withStatus(error, status);

  const list = (data ?? []) as Vehicle[];
  if (list.length > 0) return { vehicles: list, created: false };

  // 車両が 1 台でもあれば users 行は FK（vehicles_user_id_fkey。本番 DB に存在し、0001 も作成する）により
  // 必ず存在する。挿入する場合だけ保証すればよい。
  await ensureUserRow(supabase, userId);

  const { data: inserted, error: insertErr, status: insertStatus } = await supabase
    .from("vehicles")
    .insert(vehicleInsertRow(userId, seed ?? { name: DEFAULT_VEHICLE_NAME, type: "car" }))
    .select()
    .single();
  if (insertErr) throw withStatus(insertErr, insertStatus);
  return { vehicles: [inserted as Vehicle], created: true };
}

const ensureInflight = new Map<string, Promise<Vehicle[]>>();

/**
 * ユーザーの車両一覧を created_at → id の昇順で返す。1 台もなければ既定車両を作成する。
 * 同一 userId で並行して呼ばれても作成は 1 回（タブ内の Promise 共有 + クロスタブロック）。
 *
 * @throws Supabase エラー（呼び出し側で障害分類する）。エラーには `status` を付与する。
 */
export function ensureDefaultVehicle(supabase: SupabaseClient, userId: string, seed?: VehicleSeed): Promise<Vehicle[]> {
  const existing = ensureInflight.get(userId);
  if (existing) return existing;

  const run = withCrossTabLock(userId, async () => (await ensureDefaultVehicleUnlocked(supabase, userId, seed)).vehicles);
  ensureInflight.set(userId, run);
  run.finally(() => {
    if (ensureInflight.get(userId) === run) ensureInflight.delete(userId);
  }).catch(() => {});
  return run;
}

// ------------------------------------------------------------------
// ストア
// ------------------------------------------------------------------

/** createCloudStores の戻り値（両インターフェースを満たすことを型で確認する） */
export type CloudStores = DataStores;

export function createCloudStores(supabase: SupabaseClient, userId: string): CloudStores {
  const records: RecordStore = {
    async list(scope) {
      // 選択中の車両が UUID でない = 車両一覧が未確定。クエリを発行しない（呼び出し側も事前に確認する）
      if (!isUuid(scope.vehicleId)) return [];
      // 未分類（vehicle_id が null）の記録は既定車両を選択しているときだけ含める。
      // 常に含めると、車両が複数あるとき全車両に同じ記録が重複表示・重複集計されてしまう。
      // vehicleId は UUID 形式を検証済みなので、フィルタ式に安全に埋め込める。
      let query = supabase.from("fuel_records").select("*").order("date", { ascending: false });
      query = scope.includeUnclassified
        ? query.or(`vehicle_id.eq.${scope.vehicleId},vehicle_id.is.null`)
        : query.eq("vehicle_id", scope.vehicleId);
      const { data, error, status } = await query;
      if (error) throw withStatus(error, status);
      return ((data ?? []) as FuelRecord[]).map(r => normalizeRecord(r));
    },

    async listAll() {
      const all: FuelRecord[] = [];
      let from = 0;
      for (;;) {
        const { data, error, status } = await supabase
          .from("fuel_records")
          .select("*")
          .eq("user_id", userId)
          .order("date", { ascending: false })
          .order("id", { ascending: true })
          .range(from, from + LIST_PAGE - 1);
        if (error) throw withStatus(error, status);
        const page = (data ?? []) as FuelRecord[];
        // 空のページが返るまで読む。Supabase の max-rows が LIST_PAGE より小さく設定されていても、
        // 「LIST_PAGE 件未満 = 最終ページ」と誤認してバックアップが黙って欠けないように、
        // 実際に返った件数だけ読み進める
        if (page.length === 0) break;
        all.push(...page);
        from += page.length;
      }
      return all.map(r => normalizeRecord(r));
    },

    async add(input) {
      if (!isUuid(input.vehicle_id)) {
        // 車両一覧が未確定のまま保存すると vehicle_id=null の「未分類」記録になってしまうため拒否する
        throw new DataError("車両情報の読み込みが完了していないため保存できません。しばらく待ってから再度お試しください。", {
          code: VALIDATION_CODE,
        });
      }
      // created_at は DB の既定値（現在時刻）にする（呼び出し側の値は使わない）
      const columns = pickRecordColumns(input);
      delete columns.vehicle_id;
      delete columns.created_at;
      const { data, error, status } = await supabase
        .from("fuel_records")
        .insert({ ...columns, user_id: userId, vehicle_id: input.vehicle_id })
        .select()
        .single();
      if (error) throw withStatus(error, status);
      return normalizeRecord(data as FuelRecord);
    },

    async addMany(inputs, onProgress) {
      if (inputs.length === 0) return 0;
      if (inputs.some(item => !isUuid(item.vehicle_id))) {
        // ログイン中に vehicle_id=null（未分類）で保存しない
        throw new DataError("車両が決まっていない記録があるため追加できません。画面を再読み込みしてから再度お試しください。", {
          code: VALIDATION_CODE,
        });
      }
      const nowIso = new Date().toISOString();
      const payload = inputs.map(item => ({
        user_id: userId,
        vehicle_id: item.vehicle_id,
        date: item.date,
        total_distance: item.total_distance,
        fuel_amount: item.fuel_amount,
        gas_station: item.gas_station,
        price_per_unit: item.price_per_unit,
        total_cost: item.total_cost,
        fuel_efficiency: item.fuel_efficiency,
        // insert(配列) は全行のキーの和集合を送るため、created_at は全行に必ず入れる。
        // Postgres が拒否・誤読しない ISO 文字列に正規化し、無効なら現在時刻にする
        created_at: normalizeTimestamp(item.created_at) ?? nowIso,
        // 0004 の列は値があるものだけ送る。キーの無い行には defaultToNull: false により列の既定値
        // （満タン・記録漏れなし・null）が入る
        ...pickRecordColumns({
          odometer: item.odometer,
          is_full: item.is_full,
          missed_previous: item.missed_previous,
          fuel_type: item.fuel_type,
          memo: item.memo,
        }),
      }));

      let inserted = 0;
      try {
        for (let i = 0; i < payload.length; i += INSERT_CHUNK) {
          const chunk = payload.slice(i, i + INSERT_CHUNK);
          const { error, status } = await supabase.from("fuel_records").insert(chunk, { defaultToNull: false });
          if (error) throw withStatus(error, status);
          inserted += chunk.length;
          onProgress?.(inserted, payload.length);
        }
      } catch (e) {
        throw new PartialWriteError(e, inserted);
      }
      return inserted;
    },

    async update(id, patch) {
      const columns = pickRecordColumns(patch);
      if (Object.keys(columns).length === 0) return;
      const { error, status } = await supabase.from("fuel_records").update(columns).eq("id", id);
      if (error) throw withStatus(error, status);
    },

    async remove(id) {
      const { error, status } = await supabase.from("fuel_records").delete().eq("id", id);
      if (error) throw withStatus(error, status);
    },

    async removeByVehicle(vehicleId, { includeUnclassified }) {
      // 既定車両なら、そこに表示されている未分類（vehicle_id が null）の記録も削除する。
      // id は UUID 形式を検証してからフィルタ式に埋め込む。
      const query = supabase.from("fuel_records").delete().eq("user_id", userId);
      const { error, status } = await (includeUnclassified && isUuid(vehicleId)
        ? query.or(`vehicle_id.eq.${vehicleId},vehicle_id.is.null`)
        : query.eq("vehicle_id", vehicleId));
      if (error) throw withStatus(error, status);
    },
  };

  const vehicles: VehicleStore = {
    async list() {
      // 1 台もなければ既定車両を自動生成する。0004 適用前の DB でも新しい列は既定値で補う
      return (await ensureDefaultVehicle(supabase, userId)).map(v => normalizeVehicle(v));
    },

    async add(input) {
      const { data, error, status } = await supabase
        .from("vehicles")
        .insert({ user_id: userId, name: input.name, type: input.type, ...sanitizeVehicleSettings(input) })
        .select()
        .single();
      if (error) throw withStatus(error, status);
      return normalizeVehicle(data as Vehicle);
    },

    async addMany(inputs) {
      // 1 台ずつ入力順に挿入する。1 文でまとめて挿入すると created_at が同じになり、
      // 再読み込み後の並び（created_at → id 順）が入力の順序とずれるため。
      const created: Vehicle[] = [];
      try {
        for (const item of inputs) {
          const { data, error, status } = await supabase
            .from("vehicles")
            .insert({ user_id: userId, name: item.name, type: item.type, ...sanitizeVehicleSettings(item) })
            .select()
            .single();
          if (error) throw withStatus(error, status);
          created.push(normalizeVehicle(data as Vehicle));
        }
      } catch (e) {
        throw new PartialWriteError(e, created.length, created);
      }
      return created;
    },

    async update(id, patch) {
      const { error, status } = await supabase.from("vehicles").update(vehiclePatchColumns(patch)).eq("id", id);
      if (error) throw withStatus(error, status);
    },

    async remove(id) {
      const { error, status } = await supabase.from("vehicles").delete().eq("id", id);
      if (error) throw withStatus(error, status);
    },
  };

  return { records, vehicles };
}
