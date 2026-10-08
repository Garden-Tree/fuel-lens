import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  runWithOutageHandling,
  toDataError,
  withCache,
  withOutageHandling,
  type CacheIO,
  type OutageHandlingOptions,
} from "@/lib/data/withOutage";
import { DataError, PartialWriteError, READ_ONLY_CODE, type RecordStore, type VehicleStore } from "@/lib/data/types";
import { CLOUD_LOAD_ERROR_MESSAGE, PERMISSION_DENIED_MESSAGE, type SupabaseOutage } from "@/lib/supabase/errors";
import { AUTH_TOKEN_ERROR_CODE, AUTH_TOKEN_ERROR_MESSAGE, SupabaseAuthTokenError } from "@/lib/supabaseClient";
import type { FuelRecord, Vehicle } from "@/lib/types";

const V1 = "11111111-1111-4111-8111-111111111111";
const V2 = "22222222-2222-4222-8222-222222222222";

const rec = (id: string, vehicle_id: string | null): FuelRecord => ({
  id,
  date: "2026-09-01",
  total_distance: 100,
  fuel_amount: 10,
  gas_station: null,
  price_per_unit: null,
  total_cost: null,
  fuel_efficiency: null,
  vehicle_id,
});
const veh = (id: string): Vehicle => ({ id, user_id: "u", name: id, type: "car" });

function outageOptions(readOnly: SupabaseOutage | null = null) {
  const failures: SupabaseOutage[] = [];
  const onRecover = vi.fn();
  const options: OutageHandlingOptions = {
    isReadOnly: () => readOnly,
    onFailure: kind => failures.push(kind),
    onRecover,
  };
  return { options, failures, onRecover };
}

function fakeRecordStore(overrides: Partial<RecordStore> = {}): RecordStore {
  return {
    list: vi.fn<RecordStore["list"]>(async () => []),
    listAll: vi.fn<RecordStore["listAll"]>(async () => []),
    add: vi.fn<RecordStore["add"]>(async input => ({ ...input, id: "new" })),
    addMany: vi.fn<RecordStore["addMany"]>(async inputs => inputs.length),
    update: vi.fn<RecordStore["update"]>(async () => {}),
    remove: vi.fn<RecordStore["remove"]>(async () => {}),
    removeByVehicle: vi.fn<RecordStore["removeByVehicle"]>(async () => {}),
    ...overrides,
  };
}

function fakeVehicleStore(overrides: Partial<VehicleStore> = {}): VehicleStore {
  return {
    list: vi.fn<VehicleStore["list"]>(async () => []),
    add: vi.fn<VehicleStore["add"]>(async input => ({ ...veh("new"), ...input })),
    addMany: vi.fn<VehicleStore["addMany"]>(async inputs => inputs.map((x, i) => ({ ...veh(`n${i}`), ...x }))),
    update: vi.fn<VehicleStore["update"]>(async () => {}),
    remove: vi.fn<VehicleStore["remove"]>(async () => {}),
    ...overrides,
  };
}

function memoryCache() {
  const map = new Map<string, unknown>();
  const io: CacheIO = { read: k => (map.has(k) ? JSON.parse(JSON.stringify(map.get(k))) : null), write: (k, v) => void map.set(k, v) };
  return { map, io };
}

const fail = (status: number, error: object = { message: "x" }) => Object.assign(error, { status });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("withOutageHandling", () => {
  it("classifies 540 as paused and 0 as unreachable on reads, with the generic Japanese load message", async () => {
    const { options, failures, onRecover } = outageOptions();
    const store = withOutageHandling(
      fakeRecordStore({
        list: async () => {
          throw fail(540);
        },
        listAll: async () => {
          throw fail(0, { message: "TypeError: Failed to fetch" });
        },
      }),
      options
    );
    const e1 = await store.list({ vehicleId: V1, includeUnclassified: false }).catch(e => e);
    expect(e1).toBeInstanceOf(DataError);
    expect(e1).toMatchObject({ outage: "paused", status: 540, message: CLOUD_LOAD_ERROR_MESSAGE });
    const e2 = await store.listAll().catch(e => e);
    expect(e2).toMatchObject({ outage: "unreachable", status: 0 });
    expect(failures).toEqual(["paused", "unreachable"]);
    expect(onRecover).not.toHaveBeenCalled();
  });

  it("clears the outage only after a successful list (not listAll or writes)", async () => {
    const { options, onRecover } = outageOptions();
    const store = withOutageHandling(fakeRecordStore(), options);
    await store.listAll();
    await store.remove("r1");
    expect(onRecover).not.toHaveBeenCalled();
    await store.list({ vehicleId: V1, includeUnclassified: false });
    expect(onRecover).toHaveBeenCalledTimes(1);
  });

  it("refuses writes while read-only with the Japanese message, without calling the store", async () => {
    const inner = fakeVehicleStore();
    const store = withOutageHandling(inner, outageOptions("paused").options);
    const err = await store.add({ name: "x", type: "car" }).catch(e => e);
    expect(err).toBeInstanceOf(DataError);
    expect(err).toMatchObject({ code: READ_ONLY_CODE, outage: "paused" });
    expect(err.message).toContain("一時停止中のため、現在は閲覧専用です");
    expect(inner.add).not.toHaveBeenCalled();

    const unreachable = withOutageHandling(fakeRecordStore(), outageOptions("unreachable").options);
    await expect(unreachable.removeByVehicle(V1, { includeUnclassified: true })).rejects.toThrow("接続できないため、現在は閲覧専用です");
    // 読み込みは閲覧専用中も呼べる
    await expect(unreachable.list({ vehicleId: V1, includeUnclassified: false })).resolves.toEqual([]);
  });

  it("maps 42501 to the permission message without recording an outage", async () => {
    const { options, failures } = outageOptions();
    const rls = () => fail(403, { message: "new row violates row-level security policy", code: "42501" });
    const store = withOutageHandling(
      fakeRecordStore({
        list: async () => {
          throw rls();
        },
        update: async () => {
          throw rls();
        },
      }),
      options
    );
    await expect(store.list({ vehicleId: V1, includeUnclassified: false })).rejects.toMatchObject({
      message: PERMISSION_DENIED_MESSAGE,
      outage: null,
      code: "42501",
    });
    await expect(store.update("r1", { memo: "x" })).rejects.toMatchObject({
      message: PERMISSION_DENIED_MESSAGE,
      code: "42501",
      status: 403,
    });
    expect(failures).toEqual([]);
  });

  it("maps write failures with toUserFacingWriteError (23505 / outage / other)", async () => {
    const { options, failures } = outageOptions();
    let error: object = {};
    const store = withOutageHandling(
      fakeRecordStore({
        remove: async () => {
          throw error;
        },
      }),
      options
    );
    error = fail(409, { message: "dup", code: "23505" });
    await expect(store.remove("r")).rejects.toThrow("同じ記録が既に存在します");
    error = fail(540);
    await expect(store.remove("r")).rejects.toMatchObject({ message: "クラウドに接続できません。時間をおいて再試行してください。", outage: "paused" });
    error = fail(400, { message: "bad" });
    await expect(store.remove("r")).rejects.toThrow("保存に失敗しました。時間をおいて再試行してください。");
    expect(failures).toEqual(["paused"]);
  });

  it("treats a missing auth token as an app error (never an outage)", async () => {
    const { options, failures } = outageOptions();
    const wrapped = { message: `${new SupabaseAuthTokenError().name}: x`, code: "", status: 0 };
    const store = withOutageHandling(
      fakeRecordStore({
        list: async () => {
          throw wrapped;
        },
        add: async () => {
          throw new SupabaseAuthTokenError();
        },
      }),
      options
    );
    await expect(store.list({ vehicleId: V1, includeUnclassified: false })).rejects.toMatchObject({
      message: AUTH_TOKEN_ERROR_MESSAGE,
      outage: null,
      code: AUTH_TOKEN_ERROR_CODE,
    });
    await expect(store.add({ ...rec("x", V1), vehicle_id: V1 })).rejects.toMatchObject({ message: AUTH_TOKEN_ERROR_MESSAGE });
    expect(failures).toEqual([]);
  });

  it("passes DataError (validation) through and converts PartialWriteError keeping done / created", async () => {
    const { options, failures } = outageOptions();
    const validation = new DataError("車両が決まっていない記録があるため追加できません。");
    const created = [veh("a")];
    const records = withOutageHandling(
      fakeRecordStore({
        addMany: async () => {
          throw validation;
        },
      }),
      options
    );
    await expect(records.addMany([])).rejects.toBe(validation);

    const vehicles = withOutageHandling(
      fakeVehicleStore({
        addMany: async () => {
          throw new PartialWriteError(fail(503), 1, created);
        },
      }),
      options
    );
    const err = await vehicles.addMany([]).catch(e => e);
    expect(err).toMatchObject({ done: 1, outage: "unreachable", status: 503 });
    expect(err.created).toEqual(created);
    expect(failures).toEqual(["unreachable"]);
  });

  it("runWithOutageHandling / toDataError can be used for non-store calls (bootstrap)", async () => {
    const { options, failures } = outageOptions("paused");
    // read は閲覧専用でも実行する
    await expect(runWithOutageHandling(async () => 1, options, "read")).resolves.toBe(1);
    await expect(
      runWithOutageHandling(
        async () => {
          throw fail(540);
        },
        options,
        "read"
      )
    ).rejects.toMatchObject({ outage: "paused" });
    expect(failures).toEqual(["paused"]);
    expect(toDataError(new Error("x"), "read").message).toBe(CLOUD_LOAD_ERROR_MESSAGE);
  });
});

describe("withCache (records)", () => {
  const scope1 = { vehicleId: V1, includeUnclassified: true };
  const key = (s: { vehicleId: string | null }) => `cache_${s.vehicleId}`;

  it("writes the list after success and keeps it for the fallback after a failure", async () => {
    const { map, io } = memoryCache();
    let failing = false;
    const store = withCache(
      fakeRecordStore({
        list: async () => {
          if (failing) throw new DataError("x", { outage: "paused" });
          return [rec("a", V1), rec("b", null)];
        },
      }),
      { key, io }
    );
    expect(store.cached(scope1)).toBeNull();
    await store.list(scope1);
    expect((map.get("cache_" + V1) as FuelRecord[]).map(r => r.id)).toEqual(["a", "b"]);

    failing = true;
    await expect(store.list(scope1)).rejects.toMatchObject({ outage: "paused" });
    expect(store.cached(scope1)?.map(r => r.id)).toEqual(["a", "b"]);
  });

  it("reflects successful writes into the last listed scope", async () => {
    const { map, io } = memoryCache();
    const store = withCache(fakeRecordStore({ list: async () => [rec("a", V1), rec("b", null)] }), { key, io });
    await store.list(scope1);
    await store.add({ ...rec("ignored", V1), vehicle_id: V1 });
    await store.update("a", { vehicle_id: V2 }); // 別の車両へ移動 → 範囲外
    await store.remove("b");
    expect((map.get("cache_" + V1) as FuelRecord[]).map(r => r.id)).toEqual(["new"]);
  });

  it("does not reflect writes after a failed list, nor into a superseded list", async () => {
    const { map, io } = memoryCache();
    let failing = false;
    const store = withCache(
      fakeRecordStore({
        list: async s => {
          if (failing) throw new DataError("x");
          return [rec(`r-${s.vehicleId}`, s.vehicleId)];
        },
      }),
      { key, io }
    );
    await store.list(scope1);
    failing = true;
    await store.list(scope1).catch(() => {});
    await store.remove(`r-${V1}`);
    expect((map.get("cache_" + V1) as FuelRecord[]).map(r => r.id)).toEqual([`r-${V1}`]);

    // 古い list の応答は、後から始まった list の範囲を上書きしない
    failing = false;
    const scope2 = { vehicleId: V2, includeUnclassified: false };
    const first = store.list(scope1);
    const second = store.list(scope2);
    await Promise.all([first, second]);
    await store.add({ ...rec("x", V2), vehicle_id: V2 });
    expect((map.get("cache_" + V2) as FuelRecord[]).map(r => r.id)).toEqual(["new", `r-${V2}`]);
    expect((map.get("cache_" + V1) as FuelRecord[]).map(r => r.id)).toEqual([`r-${V1}`]);
  });

  it("falls back to the cache on an outage when stacked on withOutageHandling", async () => {
    const { io } = memoryCache();
    const { options, failures } = outageOptions();
    let status = 200;
    const store = withCache(
      withOutageHandling(
        fakeRecordStore({
          list: async () => {
            if (status !== 200) throw fail(status);
            return [rec("a", V1)];
          },
        }),
        options
      ),
      { key, io }
    );
    await store.list(scope1);
    status = 540;
    const err = await store.list(scope1).catch(e => e);
    expect(err).toMatchObject({ outage: "paused" });
    expect(failures).toEqual(["paused"]);
    expect(store.cached(scope1)?.map(r => r.id)).toEqual(["a"]);
  });
});

describe("withCache (vehicles)", () => {
  it("appends added vehicles (including partially created ones), merges updates and removes", async () => {
    const { map, io } = memoryCache();
    let failAddMany = false;
    const store = withCache(
      fakeVehicleStore({
        list: async () => [veh("a"), veh("b")],
        addMany: async inputs => {
          if (failAddMany) throw new DataError("x", { done: 1, created: [veh("p")] });
          return inputs.map((x, i) => ({ ...veh(`n${i}`), ...x }));
        },
      }),
      { key: "veh", io }
    );
    await store.list();
    await store.add({ name: "c", type: "bike" });
    await store.addMany([{ name: "d", type: "car" }]);
    failAddMany = true;
    await expect(store.addMany([{ name: "e", type: "car" }])).rejects.toBeInstanceOf(DataError);
    await store.update("a", { name: "A", distance_mode: "odometer" });
    await store.remove("b");
    const cached = map.get("veh") as Vehicle[];
    expect(cached.map(v => v.id)).toEqual(["a", "new", "n0", "p"]);
    expect(cached[0]).toMatchObject({ name: "A", distance_mode: "odometer" });
    expect(store.cached()?.map(v => v.id)).toEqual(["a", "new", "n0", "p"]);
  });
});
