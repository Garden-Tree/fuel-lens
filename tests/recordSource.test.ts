import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildBackup,
  finalizeRestoreRecords,
  parseBackup,
  planRestore,
  serializeBackup,
  type FuelLensBackup,
} from "@/lib/backup";
import { createCloudStores } from "@/lib/data/cloudStore";
import { applyRecordPatch, pickRecordColumns, pickUpdateColumns } from "@/lib/data/columns";
import { LOCAL_RECORDS_KEY, createLocalStores } from "@/lib/data/localStore";
import { applyFillChain, isRecordSource, normalizeRecord, sanitizeRecordSource } from "@/lib/fillChain";
import { fuelioToBackup, type ParsedFuelio } from "@/lib/importers/fuelio";
import { fuelLensCsvToBackup, type ParsedFuelLensCsv } from "@/lib/importers/fuellensCsv";
import { RECORD_SOURCES, type FuelRecord, type RecordSource, type Vehicle } from "@/lib/types";
import { makeStorage, makeSupabase, op } from "./data/fakeSupabase";

const V1 = "11111111-1111-4111-8111-111111111111";

const rec = (overrides: Partial<FuelRecord> = {}): FuelRecord => ({
  id: "r1",
  date: "2026-09-01",
  total_distance: 100,
  fuel_amount: 10,
  gas_station: null,
  price_per_unit: 170,
  total_cost: 1700,
  fuel_efficiency: 10,
  vehicle_id: V1,
  created_at: "2026-09-01T03:00:00.000Z",
  ...overrides,
});

const vehicle = (id: string, name: string): Vehicle => ({ id, user_id: "u", name, type: "car" });

afterEach(() => vi.restoreAllMocks());

describe("RecordSource validator", () => {
  it("accepts exactly the known values", () => {
    expect(RECORD_SOURCES).toEqual(["scan", "manual", "calc", "import", "restore"]);
    for (const s of RECORD_SOURCES) {
      expect(isRecordSource(s)).toBe(true);
      expect(sanitizeRecordSource(s)).toBe(s);
    }
  });

  it("maps unknown strings and non-strings to null without throwing", () => {
    for (const v of ["batch", "SCAN", "", " scan", "x".repeat(100), null, undefined, 1, true, {}, []]) {
      expect(isRecordSource(v)).toBe(false);
      expect(sanitizeRecordSource(v)).toBeNull();
    }
  });

  it("normalizeRecord fills source with null and keeps a valid one", () => {
    expect(normalizeRecord(rec()).source).toBeNull();
    expect(normalizeRecord(rec({ source: "scan" })).source).toBe("scan");
    expect(normalizeRecord(rec({ source: "future" as RecordSource })).source).toBeNull();
  });

  it("pickRecordColumns validates source; pickUpdateColumns never saves it", () => {
    expect(pickRecordColumns({ source: "calc" })).toEqual({ source: "calc" });
    expect(pickRecordColumns({ source: "nope" as RecordSource })).toEqual({ source: null });
    expect(pickRecordColumns({ memo: "x" })).not.toHaveProperty("source");
    expect(pickUpdateColumns({ source: "manual", memo: "x" })).toEqual({ memo: "x" });
    expect(pickUpdateColumns({ source: "manual" })).toEqual({});
  });

  it("applyRecordPatch preserves the existing source and ignores a patched one", () => {
    const base = normalizeRecord(rec({ source: "scan" }));
    expect(applyRecordPatch(base, { memo: "編集" }).source).toBe("scan");
    expect(applyRecordPatch(base, { source: "manual" }).source).toBe("scan");
    expect(applyRecordPatch(normalizeRecord(rec()), { source: "manual" }).source).toBeNull();
  });
});

describe("applyFillChain ignores source", () => {
  it("returns identical values with and without source", () => {
    const base: FuelRecord[] = [
      rec({ id: "a", date: "2026-08-01", fuel_amount: 40, total_distance: 0, fuel_efficiency: null, odometer: 1000 }),
      rec({ id: "b", date: "2026-08-10", fuel_amount: 20, total_distance: 300, is_full: false, odometer: 1300 }),
      rec({ id: "c", date: "2026-08-20", fuel_amount: 30, total_distance: 450, odometer: 1750 }),
      rec({ id: "d", date: "2026-09-01", fuel_amount: 25, total_distance: 400, missed_previous: true, odometer: 2150 }),
    ];
    const sources: (RecordSource | null)[] = ["scan", "manual", "calc", "import", null];
    const tagged = base.map((r, i) => ({ ...r, source: sources[i % sources.length] }));
    const strip = (list: FuelRecord[]) => list.map(({ source, ...rest }) => (void source, rest));
    expect(strip(applyFillChain(tagged, { distance_mode: "trip" }))).toEqual(
      strip(applyFillChain(base, { distance_mode: "trip" }))
    );
    expect(strip(applyFillChain(tagged, { distance_mode: "odometer" }))).toEqual(
      strip(applyFillChain(base, { distance_mode: "odometer" }))
    );
  });

  it("keeps the source on the returned records", () => {
    const out = applyFillChain([rec({ id: "a", source: "scan" })], { distance_mode: "trip" });
    expect(out[0].source).toBe("scan");
  });
});

describe("local RecordStore round-trip", () => {
  it("add stores source; list / listAll return it; old rows read as null", async () => {
    const { store, storage } = makeStorage({
      [LOCAL_RECORDS_KEY]: JSON.stringify([{ ...rec({ id: "old" }), vehicle_id: "default-car" }]),
    });
    const { records } = createLocalStores(storage);
    const added = await records.add({ ...rec(), vehicle_id: null, source: "scan" });
    expect(added.source).toBe("scan");
    expect(JSON.parse(store.get(LOCAL_RECORDS_KEY)!)[0].source).toBe("scan");

    const all = await records.listAll();
    expect(Object.fromEntries(all.map(r => [r.id, r.source]))).toEqual({ [added.id]: "scan", old: null });
  });

  it("add without source stores null; an unknown source is dropped", async () => {
    const { records } = createLocalStores(makeStorage().storage);
    expect((await records.add({ ...rec(), vehicle_id: null })).source).toBeNull();
    expect((await records.add({ ...rec(), vehicle_id: null, source: "zzz" as RecordSource })).source).toBeNull();
  });

  it("addMany keeps source; update (edit) never changes it", async () => {
    const { records } = createLocalStores(makeStorage().storage);
    await records.addMany([{ ...rec({ id: "x", source: "restore" }) }, { ...rec({ id: "y" }) }]);
    const [first] = await records.listAll();
    await records.update(first.id, { memo: "メモ", source: "manual" });
    const after = await records.listAll();
    expect(after.map(r => r.source)).toEqual(["restore", null]);
    expect(after[0].memo).toBe("メモ");
  });
});

describe("cloud RecordStore round-trip", () => {
  const setup = () => {
    const { client, queries } = makeSupabase(q => ({
      data: { id: "new", ...(op(q, "insert")?.args[0] as object) },
      status: 201,
    }));
    return { records: createCloudStores(client, "user_x").records, queries };
  };

  it("add sends source and returns the normalized stored value", async () => {
    const { records, queries } = setup();
    const added = await records.add({ ...rec(), vehicle_id: V1, source: "calc" });
    expect((op(queries[0], "insert")!.args[0] as Record<string, unknown>).source).toBe("calc");
    expect(added.source).toBe("calc");
  });

  it("add sends no source key when none is given (DB default null), and null for an unknown one", async () => {
    const { records, queries } = setup();
    await records.add({ ...rec(), vehicle_id: V1 });
    expect(op(queries[0], "insert")!.args[0]).not.toHaveProperty("source");
    await records.add({ ...rec(), vehicle_id: V1, source: "zzz" as RecordSource });
    expect((op(queries[1], "insert")!.args[0] as Record<string, unknown>).source).toBeNull();
  });

  it("addMany sends each record's source", async () => {
    const { records, queries } = setup();
    await records.addMany([rec({ source: "import" }), rec({ source: "restore" }), rec()]);
    const rows = op(queries[0], "insert")!.args[0] as Array<Record<string, unknown>>;
    expect(rows.map(r => r.source)).toEqual(["import", "restore", undefined]);
  });

  it("update never sends source (edits preserve it) and skips the request if only source changed", async () => {
    const { records, queries } = setup();
    await records.update("r1", { memo: "x", source: "manual" });
    expect(op(queries[0], "update")!.args[0]).toEqual({ memo: "x" });
    await records.update("r2", { source: "manual" });
    expect(queries).toHaveLength(1);
  });
});

describe("backup", () => {
  it("buildBackup writes a valid source and nulls an unknown one", () => {
    const backup = buildBackup(
      [vehicle(V1, "A")],
      [rec({ id: "a", source: "scan" }), rec({ id: "b" }), rec({ id: "c", source: "future" as RecordSource })]
    );
    expect(Object.fromEntries(backup.records.map(r => [r.id, r.source]))).toEqual({ a: "scan", b: null, c: null });
  });

  it("parseBackup keeps a valid source, maps unknown / missing to null and never rejects the file for it", () => {
    const base = buildBackup([vehicle(V1, "A")], [rec({ id: "a" })]);
    const raw = JSON.parse(serializeBackup(base)) as { records: Record<string, unknown>[] };
    const withSource = (id: string, source: unknown) => ({ ...raw.records[0], id, source });
    const noKey = { ...raw.records[0], id: "d" } as Record<string, unknown>;
    delete noKey.source;
    raw.records = [withSource("a", "calc"), withSource("b", "batch"), withSource("c", 42), noKey, withSource("e", null)];
    const res = parseBackup(JSON.stringify(raw));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(Object.fromEntries(res.backup.records.map(r => [r.id, r.source]))).toEqual({
      a: "calc",
      b: null,
      c: null,
      d: null,
      e: null,
    });
  });

  it("round-trips through serialize / parse", () => {
    const text = serializeBackup(buildBackup([vehicle(V1, "A")], [rec({ source: "manual" })]));
    const res = parseBackup(text);
    expect(res.ok && res.backup.records[0].source).toBe("manual");
  });

  it("planRestore keeps a valid original source and uses restore otherwise; finalize carries it", () => {
    const backup: FuelLensBackup = {
      app: "fuel-lens",
      version: 2,
      exportedAt: "2026-10-01T00:00:00.000Z",
      vehicles: [{ id: V1, name: "A", type: "car" }],
      records: [
        rec({ id: "a", date: "2026-01-01", source: "scan" }),
        rec({ id: "b", date: "2026-01-02", source: null }),
        rec({ id: "c", date: "2026-01-03" }),
        rec({ id: "d", date: "2026-01-04", source: "batch" as RecordSource }),
      ],
    };
    const plan = planRestore(backup, [vehicle("exist", "B")], []);
    expect(plan.records.map(r => r.source)).toEqual(["scan", "restore", "restore", "restore"]);
    const finalized = finalizeRestoreRecords(plan, { [V1]: "new-vehicle" });
    expect(finalized.map(r => r.source)).toEqual(["scan", "restore", "restore", "restore"]);
  });
});

describe("importers", () => {
  it("Fuelio import marks records as import", () => {
    const parsed = {
      ok: true,
      vehicleName: "車",
      vehicleType: "car",
      vehicleKey: "k",
      tankCount: 1,
      records: [
        {
          id: "fuelio-k-1",
          date: "2026-01-01",
          total_distance: null,
          fuel_amount: 10,
          gas_station: null,
          price_per_unit: 170,
          total_cost: 1700,
          fuel_efficiency: null,
          odometer: 100,
          is_full: true,
          missed_previous: false,
          fuel_type: null,
          memo: null,
        },
      ],
      stats: {},
    } as unknown as ParsedFuelio;
    const backup = fuelioToBackup(parsed);
    expect(backup.records.map(r => r.source)).toEqual(["import"]);
    const res = parseBackup(serializeBackup(backup));
    expect(res.ok && res.backup.records[0].source).toBe("import");
    const plan = planRestore(backup, [vehicle("v0", "既定")], []);
    expect(plan.records[0].source).toBe("import");
  });

  it("FuelLens CSV import marks records as import", () => {
    const parsed = {
      ok: true,
      format: "vehicle",
      vehicleNames: [],
      records: [
        {
          id: "fuellens-csv-1",
          date: "2026-01-01",
          total_distance: 100,
          fuel_amount: 10,
          gas_station: null,
          price_per_unit: 170,
          total_cost: 1700,
          fuel_efficiency: 10,
          odometer: null,
          is_full: true,
          missed_previous: false,
          fuel_type: null,
          memo: null,
          vehicleName: null,
        },
      ],
      stats: {},
    } as unknown as ParsedFuelLensCsv;
    const backup = fuelLensCsvToBackup(parsed, { vehicleName: "車" });
    expect(backup.records.map(r => r.source)).toEqual(["import"]);
  });
});
