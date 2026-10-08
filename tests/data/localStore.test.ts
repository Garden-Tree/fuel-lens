import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LOCAL_DEFAULT_VEHICLE_ID,
  LOCAL_RECORDS_KEY,
  LOCAL_STORAGE_FULL_MESSAGE,
  LOCAL_VEHICLES_KEY,
  createLocalStores,
  writeLocalJson,
} from "@/lib/data/localStore";
import { matchesRecordScope, recordScopeOf } from "@/lib/data/scope";
import { matchesSelectedVehicle } from "@/lib/recordFilters";
import type { RecordStore, VehicleStore } from "@/lib/data/types";
import type { FuelRecord, Vehicle } from "@/lib/types";
import { makeStorage } from "./fakeSupabase";

// 型で両インターフェースを満たすことを確認する（満たさなければ typecheck が失敗する）
const _typeCheck: { records: RecordStore; vehicles: VehicleStore } = createLocalStores(makeStorage().storage);
void _typeCheck;

const rec = (id: string, vehicle_id: string | null, date = "2026-09-01", extra: Partial<FuelRecord> = {}): FuelRecord => ({
  id,
  date,
  total_distance: 100,
  fuel_amount: 10,
  gas_station: null,
  price_per_unit: 170,
  total_cost: 1700,
  fuel_efficiency: 10,
  vehicle_id,
  ...extra,
});

function setup(records?: unknown, vehicles?: unknown) {
  const initial: Record<string, string> = {};
  if (records !== undefined) initial[LOCAL_RECORDS_KEY] = JSON.stringify(records);
  if (vehicles !== undefined) initial[LOCAL_VEHICLES_KEY] = JSON.stringify(vehicles);
  const { store, storage } = makeStorage(initial);
  const stores = createLocalStores(storage);
  const saved = <T,>(key: string): T => JSON.parse(store.get(key) ?? "null") as T;
  return { store, storage, stores, saved };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("recordScopeOf / matchesRecordScope", () => {
  it("matches matchesSelectedVehicle for every selection / record combination", () => {
    const vehicleIds = [null, "", "default-car", "default-x", "v1", "v2"];
    const selections = [undefined, "", "default-car", "v1", "v2"];
    const defaults = [undefined, "v1", "v2", "default-car"];
    for (const vid of vehicleIds) {
      for (const sel of selections) {
        for (const def of defaults) {
          const record = { vehicle_id: vid };
          expect(matchesRecordScope(record, recordScopeOf(sel, def)), `${vid} / ${sel} / ${def}`).toBe(
            matchesSelectedVehicle(record, sel, def)
          );
        }
      }
    }
  });
});

describe("local RecordStore", () => {
  const list = [
    rec("1", "local-vehicle-1"),
    rec("2", null),
    rec("3", LOCAL_DEFAULT_VEHICLE_ID),
    rec("4", "local-vehicle-2"),
  ];

  it("lists only the selected vehicle; unclassified records only for the default vehicle", async () => {
    const { stores } = setup(list);
    const ids = async (sel: string | undefined, def: string | undefined) =>
      (await stores.records.list(recordScopeOf(sel, def))).map(r => r.id).sort();
    expect(await ids("local-vehicle-1", "local-vehicle-1")).toEqual(["1", "2", "3"]);
    expect(await ids("local-vehicle-2", "local-vehicle-1")).toEqual(["4"]);
    expect(await ids(LOCAL_DEFAULT_VEHICLE_ID, LOCAL_DEFAULT_VEHICLE_ID)).toEqual(["2", "3"]);
    expect(await ids(undefined, undefined)).toEqual(["2", "3"]);
  });

  it("fills the new columns with defaults and ignores broken JSON / non-record entries", async () => {
    const { stores } = setup([rec("1", null), null, 5, { id: 7 }]);
    const all = await stores.records.listAll();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ is_full: true, missed_previous: false, odometer: null, fuel_type: null, memo: null });

    const broken = makeStorage({ [LOCAL_RECORDS_KEY]: "{not json" });
    expect(await createLocalStores(broken.storage).records.listAll()).toEqual([]);
  });

  it("add: prepends, sets id / created_at itself and stores unclassified selections under default-car", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T12:00:00.000Z"));
    const { stores, saved } = setup([rec("old", "local-vehicle-1")]);

    const added = await stores.records.add({
      ...rec("ignored", null),
      vehicle_id: null,
      created_at: "1999-01-01T00:00:00Z",
      memo: "  メモ ",
    } as never);
    expect(added).toMatchObject({
      id: String(Date.parse("2026-10-01T12:00:00.000Z")),
      vehicle_id: LOCAL_DEFAULT_VEHICLE_ID,
      created_at: "2026-10-01T12:00:00.000Z",
      memo: "メモ",
      is_full: true,
    });
    expect(saved<FuelRecord[]>(LOCAL_RECORDS_KEY).map(r => r.id)).toEqual([added.id, "old"]);

    const toDefault = await stores.records.add({ ...rec("x", null), vehicle_id: "default-other" });
    expect(toDefault.vehicle_id).toBe(LOCAL_DEFAULT_VEHICLE_ID);
    const toVehicle = await stores.records.add({ ...rec("x", null), vehicle_id: "local-vehicle-1" });
    expect(toVehicle.vehicle_id).toBe("local-vehicle-1");
  });

  it("addMany: appends restored-* records with normalized created_at and reports progress", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T12:00:00.000Z"));
    const { stores, saved } = setup([rec("old", null)]);
    const onProgress = vi.fn();
    const n = await stores.records.addMany(
      [
        { ...rec("a", "local-vehicle-1"), created_at: "2026-09-01T10:00:00Z" },
        { ...rec("b", null), vehicle_id: undefined, created_at: "garbage" },
      ],
      onProgress
    );
    expect(n).toBe(2);
    expect(onProgress).toHaveBeenCalledWith(2, 2);
    const all = saved<FuelRecord[]>(LOCAL_RECORDS_KEY);
    const base = Date.now().toString(36);
    expect(all.map(r => r.id)).toEqual(["old", `restored-${base}-0`, `restored-${base}-1`]);
    expect(all[1]).toMatchObject({ vehicle_id: "local-vehicle-1", created_at: "2026-09-01T10:00:00.000Z" });
    expect(all[2]).toMatchObject({ vehicle_id: null, created_at: "2026-10-01T12:00:00.000Z" });
    expect(await stores.records.addMany([])).toBe(0);
  });

  it("update merges only known columns; remove deletes by id", async () => {
    const { stores, saved } = setup([rec("1", "local-vehicle-1"), rec("2", "local-vehicle-1")]);
    await stores.records.update("1", { vehicle_id: "local-vehicle-2", memo: "  x ", user_id: "evil" } as never);
    const after = saved<FuelRecord[]>(LOCAL_RECORDS_KEY);
    expect(after[0]).toMatchObject({ id: "1", vehicle_id: "local-vehicle-2", memo: "x" });
    expect(after[0]).not.toHaveProperty("user_id");
    await stores.records.remove("2");
    expect(saved<FuelRecord[]>(LOCAL_RECORDS_KEY).map(r => r.id)).toEqual(["1"]);
  });

  it("update / remove do not create the key when nothing is stored", async () => {
    const { stores, store } = setup();
    await stores.records.update("1", { memo: "x" });
    await stores.records.remove("1");
    expect(store.has(LOCAL_RECORDS_KEY)).toBe(false);
  });

  it("removeByVehicle keeps unclassified records unless the default vehicle is removed, and keeps garbage entries", async () => {
    const data = [...list, null, "junk"];
    const a = setup(data);
    await a.stores.records.removeByVehicle("local-vehicle-1", { includeUnclassified: false });
    expect(a.saved<unknown[]>(LOCAL_RECORDS_KEY)).toEqual([list[1], list[2], list[3], null, "junk"]);

    const b = setup(data);
    await b.stores.records.removeByVehicle("local-vehicle-1", { includeUnclassified: true });
    expect(b.saved<unknown[]>(LOCAL_RECORDS_KEY)).toEqual([list[3], null, "junk"]);
  });

  it("throws the Japanese quota message when localStorage is full", async () => {
    const { storage, stores } = setup([rec("1", null)]);
    storage.setItem = () => {
      throw new DOMException("QuotaExceededError", "QuotaExceededError");
    };
    await expect(stores.records.add({ ...rec("x", null), vehicle_id: null })).rejects.toThrow(LOCAL_STORAGE_FULL_MESSAGE);
    await expect(stores.records.update("1", { memo: "x" })).rejects.toThrow(LOCAL_STORAGE_FULL_MESSAGE);
    await expect(stores.records.addMany([rec("x", null)])).rejects.toThrow(
      "ブラウザの保存容量が不足しているため、記録を追加できませんでした。"
    );
  });
});

describe("local VehicleStore", () => {
  const v = (id: string, name = id): Vehicle => ({ id, user_id: "local", name, type: "car" });

  it("returns the default vehicle when nothing is stored (without saving it)", async () => {
    const { stores, store } = setup();
    const list = await stores.vehicles.list();
    expect(list).toEqual([expect.objectContaining({ id: LOCAL_DEFAULT_VEHICLE_ID, name: "メインカー", distance_mode: "trip" })]);
    expect(store.has(LOCAL_VEHICLES_KEY)).toBe(false);
  });

  it("add appends after the default vehicle and persists both; drops unknown settings", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T12:00:00.000Z"));
    const { stores, saved } = setup();
    const added = await stores.vehicles.add({ name: "バイク", type: "bike", distance_mode: "bogus" as never, default_fuel_type: null });
    expect(added).toMatchObject({ id: `local-vehicle-${Date.now()}`, user_id: "local", distance_mode: "trip", default_fuel_type: null });
    expect(saved<Vehicle[]>(LOCAL_VEHICLES_KEY).map(x => x.id)).toEqual([LOCAL_DEFAULT_VEHICLE_ID, added.id]);
  });

  it("addMany returns vehicles in input order with numbered ids", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T12:00:00.000Z"));
    const { stores, saved } = setup(undefined, [v("local-vehicle-1")]);
    const created = await stores.vehicles.addMany([
      { name: "A", type: "car" },
      { name: "B", type: "bike", distance_mode: "odometer" },
    ]);
    const base = Date.now();
    expect(created.map(x => [x.id, x.name, x.distance_mode])).toEqual([
      [`local-vehicle-${base}-0`, "A", "trip"],
      [`local-vehicle-${base}-1`, "B", "odometer"],
    ]);
    expect(saved<Vehicle[]>(LOCAL_VEHICLES_KEY).map(x => x.id)).toEqual(["local-vehicle-1", ...created.map(x => x.id)]);
    expect(await stores.vehicles.addMany([])).toEqual([]);
  });

  it("update merges name / type / settings; remove filters", async () => {
    const { stores, saved } = setup(undefined, [v("a"), v("b")]);
    await stores.vehicles.update("b", { name: "B2", type: "bike", distance_mode: "odometer" });
    expect(saved<Vehicle[]>(LOCAL_VEHICLES_KEY)[1]).toMatchObject({ id: "b", name: "B2", type: "bike", distance_mode: "odometer" });
    await stores.vehicles.remove("a");
    expect(saved<Vehicle[]>(LOCAL_VEHICLES_KEY).map(x => x.id)).toEqual(["b"]);
  });

  it("throws the Japanese quota messages", async () => {
    const { storage, stores } = setup(undefined, [v("a"), v("b")]);
    storage.setItem = () => {
      throw new DOMException("QuotaExceededError", "QuotaExceededError");
    };
    await expect(stores.vehicles.add({ name: "x", type: "car" })).rejects.toThrow(LOCAL_STORAGE_FULL_MESSAGE);
    await expect(stores.vehicles.update("a", { name: "x" })).rejects.toThrow(LOCAL_STORAGE_FULL_MESSAGE);
    await expect(stores.vehicles.remove("a")).rejects.toThrow(LOCAL_STORAGE_FULL_MESSAGE);
    await expect(stores.vehicles.addMany([{ name: "x", type: "car" }])).rejects.toThrow(
      "ブラウザの保存容量が不足しているため、車両を追加できませんでした。"
    );
  });
});

describe("writeLocalJson", () => {
  it("does nothing without storage (SSR) and wraps quota errors in the Japanese message", () => {
    expect(() => writeLocalJson("k", [1], null)).not.toThrow();
    const { storage, store } = makeStorage();
    writeLocalJson("k", [1], storage);
    expect(store.get("k")).toBe("[1]");
    storage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    expect(() => writeLocalJson("k", [2], storage)).toThrow(LOCAL_STORAGE_FULL_MESSAGE);
  });
});
