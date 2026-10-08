/**
 * 未ログイン時の保存先（localStorage）。RecordStore / VehicleStore の実装。
 *
 * - 記録は `fuel_lens_data`、車両は `fuel_lens_vehicles` に JSON 配列で保存する
 * - 車両が 1 台も保存されていなければ既定車両 `default-car`（メインカー）を返す（保存はしない）
 * - 記録の vehicle_id が null / default-* なら「未分類」。既定車両を選択中のときだけ一覧に入る（scope.ts）
 * - ID: 記録は `Date.now()`、復元した記録は `restored-<時刻36進>-<連番>`、車両は `local-vehicle-<時刻>`（一括は `-<連番>` 付き）
 * - 保存に失敗したら（容量超過など）英語の DOMException は console にだけ出し、日本語の Error を投げる
 *
 * storage を省略すると、呼び出しのたびにブラウザの localStorage を使う（SSR 中は読み込みが空、書き込みは何もしない）。
 */

import { normalizeTimestamp } from "../dates";
import { normalizeRecord, normalizeVehicle } from "../fillChain";
import { isUnclassifiedRecord } from "../recordFilters";
import type { FuelRecord, Vehicle } from "../types";
import { applyRecordPatch, applyVehiclePatch, pickRecordColumns, sanitizeVehicleSettings } from "./columns";
import { matchesRecordScope } from "./scope";
import type { DataStores, NewRecord, NewVehicle, RecordStore, RestoredRecord, VehicleStore } from "./types";

export const LOCAL_RECORDS_KEY = "fuel_lens_data";
export const LOCAL_VEHICLES_KEY = "fuel_lens_vehicles";
export const LOCAL_DEFAULT_VEHICLE_ID = "default-car";
export const DEFAULT_VEHICLE_NAME = "メインカー";

/** 未ログイン時の保存（localStorage）が容量超過などで失敗したときのメッセージ */
export const LOCAL_STORAGE_FULL_MESSAGE =
  "ブラウザの保存領域がいっぱいです。不要な記録を削除するかバックアップしてください。";

/** 未ログイン時の既定車両（車両が 1 台も保存されていないときの一覧） */
export const LOCAL_DEFAULT_VEHICLE: Vehicle = normalizeVehicle({
  id: LOCAL_DEFAULT_VEHICLE_ID,
  user_id: "local",
  name: DEFAULT_VEHICLE_NAME,
  type: "car",
});

/** ブラウザの localStorage（SSR 中は null） */
function browserStorage(): Storage | null {
  return typeof window === "undefined" ? null : localStorage;
}

/**
 * 未ログイン時のデータ（LOCAL_RECORDS_KEY / LOCAL_VEHICLES_KEY）を保存する。
 * 容量超過（QuotaExceededError）などで保存できなければ、生エラーを console.error に出し、
 * LOCAL_STORAGE_FULL_MESSAGE の Error を投げる（英語の DOMException を画面に出さない）。SSR 中は何もしない。
 */
export function writeLocalJson(key: string, value: unknown, storage: Storage | null = browserStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error("ローカルデータの保存失敗:", e);
    throw new Error(LOCAL_STORAGE_FULL_MESSAGE, { cause: e });
  }
}

function parseArray(raw: string | null): unknown[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseLocalRecords(raw: string | null): FuelRecord[] {
  return parseArray(raw).filter(
    (r): r is FuelRecord => !!r && typeof r === "object" && typeof (r as FuelRecord).id === "string"
  );
}

function parseLocalVehicles(raw: string | null): Vehicle[] {
  return parseArray(raw)
    .filter(
      (v): v is Vehicle =>
        !!v && typeof v === "object" && typeof (v as Vehicle).id === "string" && typeof (v as Vehicle).name === "string"
    )
    .map(v => normalizeVehicle(v));
}

/** createLocalStores の戻り値（両インターフェースを満たすことを型で確認する） */
export type LocalStores = DataStores;

export function createLocalStores(storage?: Storage): LocalStores {
  const getStorage = () => storage ?? browserStorage();

  const readRecords = (): FuelRecord[] => parseLocalRecords(getStorage()?.getItem(LOCAL_RECORDS_KEY) ?? null);
  const writeRecords = (list: FuelRecord[]) => writeLocalJson(LOCAL_RECORDS_KEY, list, getStorage());

  /** 保存済みの車両。1 台も無ければ既定車両（保存はしない） */
  const readVehicles = (): Vehicle[] => {
    const parsed = parseLocalVehicles(getStorage()?.getItem(LOCAL_VEHICLES_KEY) ?? null);
    return parsed.length > 0 ? parsed : [LOCAL_DEFAULT_VEHICLE];
  };
  const writeVehicles = (list: Vehicle[]) => writeLocalJson(LOCAL_VEHICLES_KEY, list, getStorage());

  const records: RecordStore = {
    async list(scope) {
      return readRecords()
        .filter(r => matchesRecordScope(r, scope))
        .map(r => normalizeRecord(r));
    },

    async listAll() {
      return readRecords().map(r => normalizeRecord(r));
    },

    async add(input: NewRecord) {
      // vehicle_id は保存先の車両（未分類・ローカル既定車両は default-car）、created_at はここで決める
      const columns = pickRecordColumns(input);
      delete columns.vehicle_id;
      delete columns.created_at;
      const target =
        input.vehicle_id && !input.vehicle_id.startsWith("default-") ? input.vehicle_id : LOCAL_DEFAULT_VEHICLE_ID;
      const added: FuelRecord = normalizeRecord({
        date: input.date,
        total_distance: null,
        fuel_amount: null,
        gas_station: null,
        price_per_unit: null,
        total_cost: null,
        fuel_efficiency: null,
        ...columns,
        id: Date.now().toString(),
        vehicle_id: target,
        created_at: new Date().toISOString(),
      });
      writeRecords([added, ...readRecords()]);
      return added;
    },

    async addMany(inputs: readonly RestoredRecord[], onProgress) {
      if (inputs.length === 0) return 0;
      const base = Date.now().toString(36);
      const nowIso = new Date().toISOString();
      const added: FuelRecord[] = inputs.map((item, i) =>
        normalizeRecord({
          id: `restored-${base}-${i}`,
          date: item.date,
          total_distance: item.total_distance,
          fuel_amount: item.fuel_amount,
          gas_station: item.gas_station,
          price_per_unit: item.price_per_unit,
          total_cost: item.total_cost,
          fuel_efficiency: item.fuel_efficiency,
          vehicle_id: item.vehicle_id ?? null,
          created_at: normalizeTimestamp(item.created_at) ?? nowIso,
          odometer: item.odometer,
          is_full: item.is_full,
          missed_previous: item.missed_previous,
          fuel_type: item.fuel_type,
          memo: item.memo,
        })
      );
      try {
        writeRecords([...readRecords(), ...added]);
      } catch (e) {
        console.error("ローカル給油記録の保存失敗:", e);
        throw new Error("ブラウザの保存容量が不足しているため、記録を追加できませんでした。");
      }
      onProgress?.(added.length, added.length);
      return added.length;
    },

    async update(id, patch) {
      const all = readRecords();
      if (all.length === 0) return;
      writeRecords(all.map(r => (r.id === id ? applyRecordPatch(r, patch) : r)));
    },

    async remove(id) {
      const all = readRecords();
      if (all.length === 0) return;
      writeRecords(all.filter(r => r.id !== id));
    },

    async removeByVehicle(vehicleId, { includeUnclassified }) {
      // 解析できない要素も残したまま、その車両（と、既定車両なら未分類）の記録だけを取り除く。
      // 失敗しても車両の削除は続ける（従来どおり console にだけ出す）
      const s = getStorage();
      const raw = s?.getItem(LOCAL_RECORDS_KEY);
      if (!s || !raw) return;
      try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return;
        const kept = parsed.filter((r: { vehicle_id?: unknown } | null) => {
          if (!r || typeof r !== "object") return true;
          const vid = r.vehicle_id;
          if (vid === vehicleId) return false;
          const unclassified = isUnclassifiedRecord({ vehicle_id: typeof vid === "string" ? vid : null });
          return !(includeUnclassified && unclassified);
        });
        s.setItem(LOCAL_RECORDS_KEY, JSON.stringify(kept));
      } catch (e) {
        console.error("ローカル給油レコードの削除失敗:", e);
      }
    },
  };

  const vehicles: VehicleStore = {
    async list() {
      return readVehicles();
    },

    async add(input: NewVehicle) {
      const added: Vehicle = normalizeVehicle({
        id: `local-vehicle-${Date.now()}`,
        user_id: "local",
        name: input.name,
        type: input.type,
        ...sanitizeVehicleSettings(input),
      });
      writeVehicles([...readVehicles(), added]);
      return added;
    },

    async addMany(inputs) {
      if (inputs.length === 0) return [];
      const base = Date.now();
      const created: Vehicle[] = inputs.map((item, i) =>
        normalizeVehicle({
          id: `local-vehicle-${base}-${i}`,
          user_id: "local",
          name: item.name,
          type: item.type,
          ...sanitizeVehicleSettings(item),
        })
      );
      const s = getStorage();
      if (s) {
        try {
          s.setItem(LOCAL_VEHICLES_KEY, JSON.stringify([...readVehicles(), ...created]));
        } catch (e) {
          console.error("ローカル車両の保存失敗:", e);
          throw new Error("ブラウザの保存容量が不足しているため、車両を追加できませんでした。");
        }
      }
      return created;
    },

    async update(id, patch) {
      writeVehicles(readVehicles().map(v => (v.id === id ? applyVehiclePatch(v, patch) : v)));
    },

    async remove(id) {
      writeVehicles(readVehicles().filter(v => v.id !== id));
    },
  };

  return { records, vehicles };
}
