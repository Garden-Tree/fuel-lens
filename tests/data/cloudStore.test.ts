import { afterEach, describe, expect, it, vi } from "vitest";
import { createCloudStores } from "@/lib/data/cloudStore";
import { DataError, PartialWriteError, VALIDATION_CODE, type RecordStore, type VehicleStore } from "@/lib/data/types";
import { withCache, withOutageHandling } from "@/lib/data/withOutage";
import type { FuelRecord } from "@/lib/types";
import { makeStorage, makeSupabase, op, ops, type Handler, type Query } from "./fakeSupabase";

const USER = "user_cloud";
const V1 = "11111111-1111-4111-8111-111111111111";
const V2 = "22222222-2222-4222-8222-222222222222";

const ok: Handler = () => ({ data: null, error: null, status: 200 });

function setup(handler: Handler = ok) {
  const { client, queries } = makeSupabase(handler);
  const stores = createCloudStores(client, USER);
  // 型で両インターフェースを満たすことを確認する
  const typed: { records: RecordStore; vehicles: VehicleStore } = stores;
  return { ...typed, queries };
}

const restored = (i: number, vehicle_id: string | null = V1, extra: Partial<FuelRecord> = {}): Omit<FuelRecord, "id"> => ({
  date: "2026-09-01",
  total_distance: 100,
  fuel_amount: 10 + i,
  gas_station: null,
  price_per_unit: 170,
  total_cost: 1700,
  fuel_efficiency: 10,
  vehicle_id,
  ...extra,
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("cloud RecordStore.list", () => {
  it("queries the vehicle only, newest date first", async () => {
    const { records, queries } = setup(() => ({ data: [{ id: "r1", date: "2026-09-01", vehicle_id: V2 }], status: 200 }));
    const list = await records.list({ vehicleId: V2, includeUnclassified: false });
    expect(list[0]).toMatchObject({ id: "r1", is_full: true, missed_previous: false, memo: null });
    const q = queries[0];
    expect(q.table).toBe("fuel_records");
    expect(op(q, "order")?.args).toEqual(["date", { ascending: false }]);
    expect(op(q, "eq")?.args).toEqual(["vehicle_id", V2]);
    expect(op(q, "or")).toBeUndefined();
  });

  it("includes null-vehicle rows only for the default vehicle", async () => {
    const { records, queries } = setup(() => ({ data: [], status: 200 }));
    await records.list({ vehicleId: V1, includeUnclassified: true });
    expect(op(queries[0], "or")?.args).toEqual([`vehicle_id.eq.${V1},vehicle_id.is.null`]);
    expect(op(queries[0], "eq")).toBeUndefined();
  });

  it("does not query for a non-UUID vehicle id (vehicles not loaded yet) and throws a Japanese validation DataError", async () => {
    const { records, queries } = setup();
    for (const vehicleId of ["default-car", null]) {
      const err = await records.list({ vehicleId, includeUnclassified: true }).catch(e => e);
      expect(err).toBeInstanceOf(DataError);
      expect(err).toMatchObject({ code: VALIDATION_CODE });
      expect(err.message).toContain("車両の指定が不正です");
    }
    expect(queries).toHaveLength(0);
  });

  it("is not treated as a successful read by the outage wrapper (no recover, no cache write)", async () => {
    const { records } = setup();
    const onRecover = vi.fn();
    const writes: string[] = [];
    const wrapped = withCache(withOutageHandling(records, { isReadOnly: () => null, onFailure: () => {}, onRecover }), {
      key: s => `k_${s.vehicleId}`,
      io: { read: () => null, write: key => void writes.push(key) },
    });
    await expect(wrapped.list({ vehicleId: "default-car", includeUnclassified: true })).rejects.toMatchObject({
      code: VALIDATION_CODE,
    });
    expect(onRecover).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it("rethrows errors with the HTTP status attached", async () => {
    const { records } = setup(() => ({ error: { message: "paused" }, status: 540 }));
    await expect(records.list({ vehicleId: V1, includeUnclassified: false })).rejects.toMatchObject({ status: 540 });
  });
});

describe("cloud RecordStore.listAll", () => {
  it("pages by the number of rows actually returned until an empty page", async () => {
    // max-rows が 2 の PostgREST を想定: 1000 件要求しても 2 件ずつしか返らない
    const rows = ["a", "b", "c", "d", "e"].map(id => ({ id, date: "2026-09-01", vehicle_id: V1 }));
    const { records, queries } = setup(q => {
      const [from] = op(q, "range")!.args as [number, number];
      return { data: rows.slice(from, from + 2), status: 200 };
    });
    const all = await records.listAll();
    expect(all.map(r => r.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(queries.map(q => op(q, "range")!.args)).toEqual([
      [0, 999],
      [2, 1001],
      [4, 1003],
      [5, 1004],
    ]);
    expect(op(queries[0], "eq")?.args).toEqual(["user_id", USER]);
    expect(ops(queries[0], "order").map(o => o.args)).toEqual([
      ["date", { ascending: false }],
      ["id", { ascending: true }],
    ]);
  });
});

describe("cloud RecordStore writes", () => {
  it("add inserts the whitelisted columns with user_id / vehicle_id and without created_at", async () => {
    const { records, queries } = setup(q => ({ data: { id: "new", ...(op(q, "insert")!.args[0] as object) }, status: 201 }));
    const added = await records.add({
      ...restored(0, V1),
      created_at: "1999-01-01T00:00:00Z",
      run_distance: 5,
      user_id: "evil",
    } as never);
    const row = op(queries[0], "insert")!.args[0] as Record<string, unknown>;
    expect(row).toMatchObject({ user_id: USER, vehicle_id: V1, fuel_amount: 10 });
    expect(row).not.toHaveProperty("created_at");
    expect(row).not.toHaveProperty("run_distance");
    expect(ops(queries[0], "select")).toHaveLength(1);
    expect(op(queries[0], "single")).toBeDefined();
    expect(added).toMatchObject({ id: "new", is_full: true });
  });

  it("add rejects a non-UUID vehicle (never saves unclassified rows while signed in)", async () => {
    const { records, queries } = setup();
    await expect(records.add({ ...restored(0), vehicle_id: null })).rejects.toBeInstanceOf(DataError);
    await expect(records.add({ ...restored(0), vehicle_id: "default-car" })).rejects.toThrow("車両情報の読み込みが完了していない");
    expect(queries).toHaveLength(0);
  });

  it("addMany inserts chunks of 100 with defaultToNull: false, normalized created_at and progress", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T12:00:00.000Z"));
    const { records, queries } = setup(() => ({ status: 201 }));
    const items = Array.from({ length: 250 }, (_, i) =>
      restored(i, i % 2 ? V1 : V2, i === 0 ? { created_at: "2026-09-01T10:00:00+09:00", is_full: false, memo: "  m " } : {})
    );
    const onProgress = vi.fn();
    expect(await records.addMany(items, onProgress)).toBe(250);
    expect(queries.map(q => (op(q, "insert")!.args[0] as unknown[]).length)).toEqual([100, 100, 50]);
    expect(op(queries[0], "insert")!.args[1]).toEqual({ defaultToNull: false });
    expect(onProgress.mock.calls).toEqual([
      [100, 250],
      [200, 250],
      [250, 250],
    ]);
    const rows = op(queries[0], "insert")!.args[0] as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({ user_id: USER, vehicle_id: V2, is_full: false, memo: "m" });
    expect(rows[0].created_at).toBe(new Date("2026-09-01T10:00:00+09:00").toISOString());
    // created_at は全行に入れる（無い行は現在時刻）。値の無い 0004 の列は送らない
    expect(rows[1].created_at).toBe("2026-10-01T12:00:00.000Z");
    expect(rows[1]).not.toHaveProperty("is_full");
    expect(rows[1]).not.toHaveProperty("memo");
  });

  it("addMany reports the rows inserted before a failure", async () => {
    let n = 0;
    const { records } = setup(() => (++n === 2 ? { error: { message: "boom", code: "XX000" }, status: 400 } : { status: 201 }));
    const err = await records.addMany(Array.from({ length: 150 }, (_, i) => restored(i))).catch(e => e);
    expect(err).toBeInstanceOf(PartialWriteError);
    expect(err.done).toBe(100);
    expect(err.cause).toMatchObject({ message: "boom", status: 400 });
  });

  it("addMany rejects any record without a vehicle UUID before inserting", async () => {
    const { records, queries } = setup();
    await expect(records.addMany([restored(0), restored(1, null)])).rejects.toThrow("車両が決まっていない記録があるため追加できません");
    expect(queries).toHaveLength(0);
    expect(await records.addMany([])).toBe(0);
  });

  it("update sends only known columns and skips the request when there are none", async () => {
    const { records, queries } = setup();
    await records.update("r1", { run_cost: 1 } as never);
    expect(queries).toHaveLength(0);
    await records.update("r1", { memo: " x ", vehicle_id: V2 });
    expect(op(queries[0], "update")!.args[0]).toEqual({ memo: "x", vehicle_id: V2 });
    expect(op(queries[0], "eq")!.args).toEqual(["id", "r1"]);
  });

  it("remove / removeByVehicle build the delete filters", async () => {
    const { records, queries } = setup();
    await records.remove("r1");
    expect(op(queries[0], "delete")).toBeDefined();
    expect(op(queries[0], "eq")!.args).toEqual(["id", "r1"]);

    await records.removeByVehicle(V1, { includeUnclassified: true });
    expect(ops(queries[1], "eq").map(o => o.args)).toEqual([["user_id", USER]]);
    expect(op(queries[1], "or")!.args).toEqual([`vehicle_id.eq.${V1},vehicle_id.is.null`]);

    await records.removeByVehicle(V2, { includeUnclassified: false });
    expect(ops(queries[2], "eq").map(o => o.args)).toEqual([
      ["user_id", USER],
      ["vehicle_id", V2],
    ]);
    // UUID でない id はフィルタ式に埋め込まない
    await records.removeByVehicle("x,vehicle_id.neq.y", { includeUnclassified: true });
    expect(op(queries[3], "or")).toBeUndefined();
  });
});

describe("cloud VehicleStore", () => {
  it("list returns vehicles ordered by created_at then id, creating the default vehicle when empty", async () => {
    // Web Locks が無い環境（Node 22 など）ではリース方式のロックが localStorage を使う
    vi.stubGlobal("localStorage", makeStorage().storage);
    const tables: string[] = [];
    const { vehicles, queries } = setup(q => {
      tables.push(q.table);
      if (q.table === "vehicles" && !op(q, "insert")) return { data: [], status: 200 };
      if (q.table === "users") return { status: 201 };
      return { data: { id: V1, ...(op(q, "insert")!.args[0] as object) }, status: 201 };
    });
    const list = await vehicles.list();
    expect(list).toEqual([expect.objectContaining({ id: V1, name: "メインカー", type: "car", distance_mode: "trip" })]);
    expect(ops(queries[0], "order").map(o => o.args[0])).toEqual(["created_at", "id"]);
    expect(tables).toEqual(["vehicles", "users", "vehicles"]);
  });

  it("addMany inserts one by one in input order and returns the created vehicles", async () => {
    let n = 0;
    const { vehicles, queries } = setup(q => ({ data: { id: `id-${++n}`, ...(op(q, "insert")!.args[0] as object) }, status: 201 }));
    const created = await vehicles.addMany([
      { name: "A", type: "car" },
      { name: "B", type: "bike", distance_mode: "odometer", default_fuel_type: "bogus" as never },
    ]);
    expect(created.map(v => [v.id, v.name])).toEqual([
      ["id-1", "A"],
      ["id-2", "B"],
    ]);
    expect(queries.map(q => op(q, "insert")!.args[0])).toEqual([
      { user_id: USER, name: "A", type: "car" },
      { user_id: USER, name: "B", type: "bike", distance_mode: "odometer" },
    ]);
    expect(queries.every(q => op(q, "single"))).toBe(true);
  });

  it("addMany keeps the vehicles created before a failure", async () => {
    let n = 0;
    const { vehicles } = setup(q =>
      ++n === 2 ? { error: { message: "rls", code: "42501" }, status: 403 } : { data: { id: `id-${n}`, ...(op(q, "insert")!.args[0] as object) }, status: 201 }
    );
    const err = await vehicles.addMany([{ name: "A", type: "car" }, { name: "B", type: "car" }]).catch(e => e);
    expect(err).toBeInstanceOf(PartialWriteError);
    expect(err.done).toBe(1);
    expect(err.created.map((v: { id: string }) => v.id)).toEqual(["id-1"]);
  });

  it("update sends name / type and sanitized settings; remove deletes by id", async () => {
    const { vehicles, queries } = setup();
    await vehicles.update(V1, { name: "N", type: "bike", default_fuel_type: null, distance_mode: "x" as never });
    expect(op(queries[0], "update")!.args[0]).toEqual({ name: "N", type: "bike", default_fuel_type: null });
    expect(op(queries[0], "eq")!.args).toEqual(["id", V1]);
    await vehicles.remove(V1);
    expect((queries[1] as Query).table).toBe("vehicles");
    expect(op(queries[1], "delete")).toBeDefined();
  });
});
