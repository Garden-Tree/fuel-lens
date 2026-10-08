import { describe, expect, it, vi } from "vitest";
import { BACKUP_VERSION, type FuelLensBackup } from "@/lib/backup";
import {
  errorText,
  executeRestore,
  RestoreError,
  restoreFailureText,
  restoreProgressText,
  restoreSuccessText,
  type AddRecords,
  type AddVehicles,
  type RestoreDeps,
  type RestoreProgress,
} from "@/lib/restore";
import type { FuelRecord, Vehicle, VehicleType } from "@/lib/types";

const UUID_A = "0f8fad5b-d9cb-469f-a165-70867728950e";
const UUID_B = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const UUID_NEW = "16fd2706-8baf-433b-82eb-8c7fada847da";

const vehicle = (id: string, name: string, type: VehicleType = "car"): Vehicle => ({
  id,
  user_id: "user_123",
  name,
  type,
  created_at: "2025-01-01T00:00:00.000Z",
});

const record = (overrides: Partial<FuelRecord> = {}): FuelRecord => ({
  id: "r1",
  date: "2026-01-15",
  total_distance: 500,
  fuel_amount: 30,
  gas_station: "ENEOS",
  price_per_unit: 170,
  total_cost: 5100,
  fuel_efficiency: 16.67,
  vehicle_id: UUID_A,
  created_at: "2026-01-15T03:00:00.000Z",
  ...overrides,
});

const backupOf = (overrides: Partial<FuelLensBackup> = {}): FuelLensBackup => ({
  app: "fuel-lens",
  version: BACKUP_VERSION,
  exportedAt: "2026-02-01T00:00:00.000Z",
  vehicles: [{ id: UUID_A, name: "メインカー", type: "car" }],
  records: [record()],
  ...overrides,
});

/** fetchAllRecords / addVehicles / addRecords の偽物。呼び出しを記録する */
function fakeDeps(
  options: {
    vehicles?: Vehicle[];
    existing?: FuelRecord[];
    addVehicles?: AddVehicles;
    addRecords?: AddRecords;
  } = {}
) {
  const calls: string[] = [];
  const fetchAllRecords = vi.fn(async () => {
    calls.push("fetchAllRecords");
    return options.existing ?? [];
  });
  const addVehicles = vi.fn<AddVehicles>(async items => {
    calls.push("addVehicles");
    if (options.addVehicles) return options.addVehicles(items);
    return items.map((item, i) => ({ ...vehicle(`${UUID_NEW.slice(0, -1)}${i}`, item.name, item.type) }));
  });
  const addRecords = vi.fn<AddRecords>(async (items, opts) => {
    calls.push("addRecords");
    if (options.addRecords) return options.addRecords(items, opts);
    opts?.onProgress?.(items.length, items.length);
    return items.length;
  });
  const deps: RestoreDeps = {
    vehicles: options.vehicles ?? [vehicle(UUID_B, "既存車")],
    fetchAllRecords,
    addVehicles,
    addRecords,
  };
  return { deps, calls, fetchAllRecords, addVehicles, addRecords };
}

describe("executeRestore", () => {
  it("refetches, creates new vehicles, then adds the finalized records (happy path)", async () => {
    const { deps, calls, addVehicles, addRecords } = fakeDeps({
      addVehicles: async items => items.map(item => vehicle(UUID_NEW, item.name, item.type)),
    });
    const backup = backupOf({
      vehicles: [{ id: UUID_A, name: " メインカー ", type: "bike", distance_mode: "odometer", default_fuel_type: "premium" }],
      records: [record({ id: "r1" }), record({ id: "r2", date: "2026-01-20" })],
    });

    const result = await executeRestore(backup, deps);

    expect(calls).toEqual(["fetchAllRecords", "addVehicles", "addRecords"]);
    // 距離の入力方式・既定の燃料種別も引き継ぐ。名前は前後の空白を除く
    expect(addVehicles).toHaveBeenCalledWith([
      { name: "メインカー", type: "bike", distance_mode: "odometer", default_fuel_type: "premium" },
    ]);
    const [items] = addRecords.mock.calls[0];
    expect(items).toHaveLength(2);
    expect(items.every(r => r.vehicle_id === UUID_NEW)).toBe(true);
    expect(items.every(r => !("backupVehicleId" in r) && !("id" in r))).toBe(true);
    expect(result).toEqual({ vehiclesAdded: 1, recordsAdded: 2, skipped: 0, changed: true });
  });

  it("maps each backup vehicle to the id addVehicles returned, in order", async () => {
    const V1 = "11111111-1111-4111-8111-111111111111";
    const V2 = "22222222-2222-4222-8222-222222222222";
    const NEW1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const NEW2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const { deps, addRecords } = fakeDeps({
      vehicles: [vehicle(UUID_B, "既存車")],
      addVehicles: async items => items.map((item, i) => vehicle(i === 0 ? NEW1 : NEW2, item.name, item.type)),
    });
    const backup = backupOf({
      vehicles: [
        { id: V1, name: "一台目", type: "car" },
        { id: V2, name: "二台目", type: "bike" },
        // 既存と名前 + 種別が一致する車両は作らずに対応付ける
        { id: UUID_A, name: "既存車", type: "car" },
      ],
      records: [
        record({ id: "a", vehicle_id: V2 }),
        record({ id: "b", vehicle_id: V1, date: "2026-01-16" }),
        record({ id: "c", vehicle_id: UUID_A, date: "2026-01-17" }),
        // 未分類はバックアップの先頭車両へ
        record({ id: "d", vehicle_id: null, date: "2026-01-18" }),
      ],
    });

    const result = await executeRestore(backup, deps);

    const [items] = addRecords.mock.calls[0];
    expect(items.map(r => r.vehicle_id)).toEqual([NEW2, NEW1, UUID_B, NEW1]);
    expect(result.vehiclesAdded).toBe(2);
  });

  it("handles a '__proto__' vehicle id without losing the mapping", async () => {
    const { deps, addRecords } = fakeDeps({
      addVehicles: async items => items.map(item => vehicle(UUID_NEW, item.name, item.type)),
    });
    const backup = backupOf({
      vehicles: [{ id: "__proto__", name: "特殊", type: "car" }],
      records: [record({ vehicle_id: "__proto__" })],
    });
    await executeRestore(backup, deps);
    expect(addRecords.mock.calls[0][0][0].vehicle_id).toBe(UUID_NEW);
  });

  it("plans against freshly fetched records, so duplicates added meanwhile are skipped (no-op)", async () => {
    const existing = [record({ id: "other-id", vehicle_id: UUID_B })];
    const { deps, calls, addVehicles, addRecords } = fakeDeps({ vehicles: [vehicle(UUID_B, "メインカー")], existing });
    const progress: RestoreProgress[] = [];

    const result = await executeRestore(backupOf(), deps, p => progress.push(p));

    expect(calls).toEqual(["fetchAllRecords"]);
    expect(addVehicles).not.toHaveBeenCalled();
    expect(addRecords).not.toHaveBeenCalled();
    expect(progress).toEqual([{ phase: "prepare" }]);
    expect(result).toEqual({ vehiclesAdded: 0, recordsAdded: 0, skipped: 1, changed: false });
  });

  it("reports progress in order: prepare → vehicles → records (from 0, then addRecords' chunks)", async () => {
    const { deps } = fakeDeps({
      addRecords: async (items, opts) => {
        opts?.onProgress?.(1, items.length);
        opts?.onProgress?.(items.length, items.length);
        return items.length;
      },
    });
    const backup = backupOf({ records: [record({ id: "r1" }), record({ id: "r2", date: "2026-01-20" })] });
    const progress: RestoreProgress[] = [];

    await executeRestore(backup, deps, p => progress.push(p));

    expect(progress).toEqual([
      { phase: "prepare" },
      { phase: "vehicles", total: 1 },
      { phase: "records", done: 0, total: 2 },
      { phase: "records", done: 1, total: 2 },
      { phase: "records", done: 2, total: 2 },
    ]);
    expect(progress.map(restoreProgressText)).toEqual([
      "準備中…",
      "車両を追加中…（1 台）",
      "記録を追加中… 0 / 2 件",
      "記録を追加中… 1 / 2 件",
      "記録を追加中… 2 / 2 件",
    ]);
  });

  it("rethrows a partial failure with addRecords' message (including how many were added) and changed=true", async () => {
    const { deps } = fakeDeps({
      vehicles: [vehicle(UUID_A, "メインカー")],
      addRecords: async (items, opts) => {
        opts?.onProgress?.(100, items.length);
        throw new Error("100 件を追加したところで中断しました。通信に失敗しました。");
      },
    });

    const error = await executeRestore(backupOf(), deps).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RestoreError);
    const re = error as RestoreError;
    expect(re.message).toBe("100 件を追加したところで中断しました。通信に失敗しました。");
    expect(re.changed).toBe(true);
    expect(re.cause).toBeInstanceOf(Error);
    expect(restoreFailureText("restore", re)).toBe(
      "100 件を追加したところで中断しました。通信に失敗しました。\nもう一度ファイルを選ぶと、残りを復元できます。"
    );
  });

  it("marks changed=true when addVehicles fails (vehicles may be partly created)", async () => {
    const { deps, addRecords } = fakeDeps({
      addVehicles: async () => {
        throw new Error("車両を追加できませんでした。");
      },
    });
    const error = (await executeRestore(backupOf(), deps).catch((e: unknown) => e)) as RestoreError;
    expect(error.changed).toBe(true);
    expect(error.message).toBe("車両を追加できませんでした。");
    expect(addRecords).not.toHaveBeenCalled();
  });

  it("marks changed=false when the refetch fails before any write, and falls back for non-Error throws", async () => {
    const { deps, fetchAllRecords, addVehicles } = fakeDeps();
    fetchAllRecords.mockRejectedValueOnce("boom");
    const error = (await executeRestore(backupOf(), deps).catch((e: unknown) => e)) as RestoreError;
    expect(error).toBeInstanceOf(RestoreError);
    expect(error.changed).toBe(false);
    expect(error.message).toBe("");
    expect(addVehicles).not.toHaveBeenCalled();
    expect(restoreFailureText("import", error)).toBe("取り込みに失敗しました\nもう一度ファイルを選ぶと、残りを取り込めます。");
  });
});

describe("restore texts", () => {
  it("builds the success toast for restore and import", () => {
    expect(restoreSuccessText("restore", { vehiclesAdded: 1, recordsAdded: 5, skipped: 0, changed: true })).toBe(
      "復元しました: 車両 1 台・記録 5 件を追加"
    );
    expect(restoreSuccessText("import", { vehiclesAdded: 0, recordsAdded: 3, skipped: 2, changed: true })).toBe(
      "取り込みました: 車両 0 台・記録 3 件を追加（重複 2 件はスキップ）"
    );
  });

  it("errorText uses the Error message or the fallback", () => {
    expect(errorText(new Error("失敗"), "既定")).toBe("失敗");
    expect(errorText(new Error(""), "既定")).toBe("既定");
    expect(errorText("x", "既定")).toBe("既定");
  });
});
