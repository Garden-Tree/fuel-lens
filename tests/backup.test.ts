import { describe, expect, it } from "vitest";
import {
  BACKUP_MAX_RECORDS,
  BACKUP_MAX_VEHICLES,
  BACKUP_VERSION,
  backupFilename,
  buildBackup,
  finalizeRestoreRecords,
  normalizeTimestamp,
  parseBackup,
  planRestore,
  serializeBackup,
  type FuelLensBackup,
} from "@/lib/backup";
import type { FuelRecord } from "@/lib/useFuelRecords";
import type { Vehicle } from "@/lib/useVehicles";

const UUID_A = "0f8fad5b-d9cb-469f-a165-70867728950e";
const UUID_B = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const UUID_C = "16fd2706-8baf-433b-82eb-8c7fada847da";
const UUID_X = "886313e1-3b8a-4372-9b90-0c9aee199e5d";

const vehicle = (id: string, name: string, type: "car" | "bike" = "car"): Vehicle => ({
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

const validBackup = (overrides: Partial<FuelLensBackup> = {}): FuelLensBackup => ({
  app: "fuel-lens",
  version: 1,
  exportedAt: "2026-02-01T00:00:00.000Z",
  vehicles: [{ id: UUID_A, name: "メインカー", type: "car" }],
  records: [record()],
  ...overrides,
});

const parseObj = (obj: unknown) => parseBackup(JSON.stringify(obj));

describe("backupFilename", () => {
  it("formats local time as fuel-lens-backup-YYYYMMDD-HHmm.json", () => {
    expect(backupFilename(new Date(2026, 0, 5, 9, 7))).toBe("fuel-lens-backup-20260105-0907.json");
    expect(backupFilename(new Date(2026, 11, 31, 23, 59))).toBe("fuel-lens-backup-20261231-2359.json");
  });
});

describe("buildBackup", () => {
  it("produces a file that parseBackup accepts (round trip)", () => {
    const now = new Date("2026-02-01T00:00:00.000Z");
    const backup = buildBackup([vehicle(UUID_A, "メインカー")], [record()], now);
    expect(backup.app).toBe("fuel-lens");
    expect(backup.version).toBe(BACKUP_VERSION);
    expect(backup.exportedAt).toBe(now.toISOString());
    const parsed = parseBackup(serializeBackup(backup));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.backup).toEqual(backup);
  });

  it("strips user_id and unknown keys", () => {
    const rec = { ...record(), user_id: "user_123", extra: 1 } as FuelRecord;
    const backup = buildBackup([vehicle(UUID_A, "A")], [rec]);
    expect(backup.vehicles[0]).not.toHaveProperty("user_id");
    expect(backup.records[0]).not.toHaveProperty("user_id");
    expect(backup.records[0]).not.toHaveProperty("extra");
  });

  it("sanitizes legacy local data so the backup stays restorable", () => {
    const legacy = {
      id: "1700000000000",
      date: "not a date",
      total_distance: -5,
      fuel_amount: Number.NaN,
      gas_station: 42,
      price_per_unit: "170",
      total_cost: 5000,
      fuel_efficiency: null,
      vehicle_id: "default-car",
      created_at: "2024-03-10T12:00:00.000Z",
    } as unknown as FuelRecord;
    const backup = buildBackup([vehicle("default-car", "  ")], [legacy, legacy]);
    expect(backup.vehicles[0].name).toBe("名称未設定");
    expect(backup.records).toHaveLength(1); // 重複 id は除去
    const r = backup.records[0];
    expect(r.date).toMatch(/^2024-03-1[01]$/); // created_at のローカル日付
    expect(r.total_distance).toBeNull();
    expect(r.fuel_amount).toBeNull();
    expect(r.gas_station).toBeNull();
    expect(r.price_per_unit).toBeNull();
    expect(r.total_cost).toBe(5000);
    expect(parseBackup(serializeBackup(backup)).ok).toBe(true);
  });
});

describe("normalizeTimestamp / created_at normalization", () => {
  it("returns ISO strings with Z, or null when unparsable / out of range", () => {
    expect(normalizeTimestamp("2024")).toBe("2024-01-01T00:00:00.000Z");
    const local = normalizeTimestamp("2024-01-05T10:00:00");
    expect(local).toBe(new Date("2024-01-05T10:00:00").toISOString()); // タイムゾーンなし = ブラウザのローカル時刻
    expect(local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(normalizeTimestamp("2024-01-05T10:00:00+09:00")).toBe("2024-01-05T01:00:00.000Z");
    expect(normalizeTimestamp("nope")).toBeNull();
    expect(normalizeTimestamp("")).toBeNull();
    expect(normalizeTimestamp("0999-01-01T00:00:00Z")).toBeNull();
    expect(normalizeTimestamp(123)).toBeNull();
  });

  it("parseBackup stores record / vehicle created_at as ISO with Z", () => {
    const res = parseObj(
      validBackup({
        vehicles: [{ id: UUID_A, name: "メインカー", type: "car", created_at: "2024" }],
        records: [record({ created_at: "2024-01-05T10:00:00" })],
      })
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.backup.vehicles[0].created_at).toBe("2024-01-01T00:00:00.000Z");
    expect(res.backup.records[0].created_at).toBe(new Date("2024-01-05T10:00:00").toISOString());
    expect(res.backup.records[0].created_at).toMatch(/Z$/);
  });

  it("buildBackup and planRestore normalize created_at too", () => {
    const backup = buildBackup(
      [{ ...vehicle(UUID_A, "メインカー"), created_at: "2024" }],
      [record({ created_at: "2024-01-05T10:00:00" }), record({ id: "r2", created_at: "garbage" })]
    );
    expect(backup.vehicles[0].created_at).toBe("2024-01-01T00:00:00.000Z");
    const byId = new Map(backup.records.map(r => [r.id, r]));
    expect(byId.get("r1")?.created_at).toBe(new Date("2024-01-05T10:00:00").toISOString());
    expect(byId.get("r2")?.created_at).toBeNull();

    const raw = validBackup({ records: [record({ created_at: "2024" })] });
    const plan = planRestore(raw, [vehicle(UUID_B, "別")], []);
    expect(plan.records[0].created_at).toBe("2024-01-01T00:00:00.000Z");
  });
});

describe("parseBackup", () => {
  it("accepts a valid backup and normalizes missing optional fields to null", () => {
    const minimal = {
      ...validBackup(),
      records: [{ id: "x1", date: "2026-01-01" }],
    };
    const res = parseObj(minimal);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.backup.records[0]).toEqual({
      id: "x1",
      date: "2026-01-01",
      total_distance: null,
      fuel_amount: null,
      price_per_unit: null,
      total_cost: null,
      fuel_efficiency: null,
      gas_station: null,
      vehicle_id: null,
      created_at: null,
    });
  });

  it("drops unknown keys (including __proto__) from the parsed objects", () => {
    const text = JSON.stringify(validBackup()).replace(
      '"id":"r1"',
      '"id":"r1","__proto__":{"polluted":true},"user_id":"someone_else"'
    );
    const res = parseBackup(text);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.backup.records[0]).not.toHaveProperty("user_id");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect((res.backup.records[0] as unknown as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("rejects non-JSON and empty input", () => {
    expect(parseBackup("").ok).toBe(false);
    expect(parseBackup("not json").ok).toBe(false);
    expect(parseBackup("[]").ok).toBe(false);
    expect(parseBackup("null").ok).toBe(false);
  });

  it("rejects a wrong app id", () => {
    const res = parseObj({ ...validBackup(), app: "other-app" });
    expect(res).toEqual({ ok: false, error: "FuelLens のバックアップファイルではありません。" });
  });

  it("rejects wrong / future versions", () => {
    const future = parseObj({ ...validBackup(), version: 2 });
    expect(future.ok).toBe(false);
    if (!future.ok) expect(future.error).toContain("新しいバージョン");
    expect(parseObj({ ...validBackup(), version: 0 }).ok).toBe(false);
    expect(parseObj({ ...validBackup(), version: "1" }).ok).toBe(false);
  });

  it("rejects a bad exportedAt", () => {
    expect(parseObj({ ...validBackup(), exportedAt: "yesterday" }).ok).toBe(false);
  });

  it.each(["2026-02-30", "2026/01/01", "20260101", "2026-1-1", "", null, 20260101])(
    "rejects bad record date %j",
    date => {
      const res = parseObj(validBackup({ records: [record({ date: date as string })] }));
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toContain("日付");
    }
  );

  it.each([
    ["fuel_amount", -1],
    ["total_cost", -0.01],
    ["total_distance", "500"],
    ["price_per_unit", 1e12],
    ["fuel_efficiency", true],
  ])("rejects invalid number %s=%j", (key, value) => {
    const res = parseObj(validBackup({ records: [{ ...record(), [key]: value } as FuelRecord] }));
    expect(res.ok).toBe(false);
  });

  it("rejects non-finite numbers that sneak in as huge literals", () => {
    const text = JSON.stringify(validBackup()).replace('"fuel_amount":30', '"fuel_amount":1e999');
    expect(parseBackup(text).ok).toBe(false);
  });

  it("rejects bad ids, names, types and gas station names", () => {
    expect(parseObj(validBackup({ records: [record({ id: "" })] })).ok).toBe(false);
    expect(parseObj(validBackup({ records: [record({ id: "a".repeat(129) })] })).ok).toBe(false);
    expect(parseObj(validBackup({ records: [record({ id: "a\nb" })] })).ok).toBe(false);
    expect(parseObj(validBackup({ records: [{ ...record(), id: 1 } as unknown as FuelRecord] })).ok).toBe(false);
    expect(parseObj(validBackup({ records: [record({ vehicle_id: 5 as unknown as string })] })).ok).toBe(false);
    expect(parseObj(validBackup({ records: [record({ gas_station: "x".repeat(201) })] })).ok).toBe(false);
    expect(parseObj(validBackup({ vehicles: [{ id: UUID_A, name: "", type: "car" }] })).ok).toBe(false);
    expect(parseObj(validBackup({ vehicles: [{ id: UUID_A, name: "A", type: "truck" as "car" }] })).ok).toBe(false);
  });

  it("rejects duplicate ids", () => {
    expect(parseObj(validBackup({ records: [record(), record()] })).ok).toBe(false);
    expect(
      parseObj(
        validBackup({
          vehicles: [
            { id: UUID_A, name: "A", type: "car" },
            { id: UUID_A, name: "B", type: "car" },
          ],
        })
      ).ok
    ).toBe(false);
  });

  it("rejects missing arrays", () => {
    const { records: _r, ...noRecords } = validBackup();
    void _r;
    expect(parseObj(noRecords).ok).toBe(false);
    expect(parseObj({ ...validBackup(), vehicles: {} }).ok).toBe(false);
  });

  it("rejects huge arrays before validating each element", () => {
    const tooManyRecords = parseObj({ ...validBackup(), records: new Array(BACKUP_MAX_RECORDS + 1).fill(0) });
    expect(tooManyRecords.ok).toBe(false);
    if (!tooManyRecords.ok) expect(tooManyRecords.error).toContain("記録が多すぎます");
    const tooManyVehicles = parseObj({ ...validBackup(), vehicles: new Array(BACKUP_MAX_VEHICLES + 1).fill(0) });
    expect(tooManyVehicles.ok).toBe(false);
  });
});

describe("planRestore", () => {
  it("matches vehicles by id first", () => {
    const plan = planRestore(validBackup({ records: [] }), [vehicle(UUID_A, "改名済み")], []);
    expect(plan.vehicleIdMap).toEqual({ [UUID_A]: UUID_A });
    expect(plan.vehiclesToCreate).toEqual([]);
    expect(plan.counts).toMatchObject({ vehiclesNew: 0, vehiclesMatched: 1 });
  });

  it("matches vehicles by name + type when ids differ (e.g. local → cloud)", () => {
    const backup = validBackup({
      vehicles: [
        { id: "default-car", name: "メインカー", type: "car" },
        { id: "local-vehicle-1", name: "スクーター", type: "bike" },
        { id: "local-vehicle-2", name: "スクーター", type: "car" }, // 種別が違う → 新規
      ],
      records: [],
    });
    const existing = [vehicle(UUID_A, "メインカー"), vehicle(UUID_B, " スクーター ", "bike")];
    const plan = planRestore(backup, existing, []);
    expect(plan.vehicleIdMap).toEqual({ "default-car": UUID_A, "local-vehicle-1": UUID_B });
    expect(plan.vehiclesToCreate).toEqual([{ backupId: "local-vehicle-2", name: "スクーター", type: "car" }]);
    expect(plan.counts).toMatchObject({ vehiclesNew: 1, vehiclesMatched: 2 });
  });

  it("does not map two backup vehicles onto the same existing vehicle", () => {
    const backup = validBackup({
      vehicles: [
        { id: "local-vehicle-1", name: "車", type: "car" },
        { id: "local-vehicle-2", name: "車", type: "car" },
      ],
      records: [],
    });
    const plan = planRestore(backup, [vehicle(UUID_A, "車")], []);
    expect(plan.vehicleIdMap).toEqual({ "local-vehicle-1": UUID_A });
    expect(plan.vehiclesToCreate.map(v => v.backupId)).toEqual(["local-vehicle-2"]);
  });

  it("does not steal an id-matched vehicle through a name match", () => {
    const backup = validBackup({
      vehicles: [
        { id: "local-vehicle-1", name: "車", type: "car" },
        { id: UUID_A, name: "車", type: "car" },
      ],
      records: [],
    });
    const plan = planRestore(backup, [vehicle(UUID_A, "車")], []);
    expect(plan.vehicleIdMap).toEqual({ [UUID_A]: UUID_A });
    expect(plan.vehiclesToCreate.map(v => v.backupId)).toEqual(["local-vehicle-1"]);
  });

  it("creates vehicles that do not exist and remaps their records", () => {
    const backup = validBackup({
      vehicles: [
        { id: UUID_A, name: "メインカー", type: "car" },
        { id: UUID_C, name: "セカンドカー", type: "car" },
      ],
      records: [record({ id: "r1", vehicle_id: UUID_A }), record({ id: "r2", vehicle_id: UUID_C })],
    });
    const plan = planRestore(backup, [vehicle(UUID_B, "メインカー")], []);
    expect(plan.vehicleIdMap).toEqual({ [UUID_A]: UUID_B });
    expect(plan.vehiclesToCreate).toEqual([{ backupId: UUID_C, name: "セカンドカー", type: "car" }]);
    expect(plan.counts).toEqual({ vehiclesNew: 1, vehiclesMatched: 1, recordsNew: 2, recordsSkipped: 0 });

    const finalized = finalizeRestoreRecords(plan, { [UUID_C]: UUID_X });
    expect(finalized.map(r => r.vehicle_id)).toEqual([UUID_B, UUID_X]);
    expect(finalized[0]).not.toHaveProperty("id");
    expect(finalized[0]).not.toHaveProperty("backupVehicleId");
    expect(finalized[0]).toMatchObject({ date: "2026-01-15", fuel_amount: 30, total_cost: 5100 });
  });

  it("sends unclassified / unknown-vehicle records to the backup's first vehicle", () => {
    const backup = validBackup({
      vehicles: [
        { id: "default-car", name: "メインカー", type: "car" },
        { id: "local-vehicle-1", name: "バイク", type: "bike" },
      ],
      records: [
        record({ id: "r1", vehicle_id: null }),
        record({ id: "r2", vehicle_id: "local-vehicle-999", date: "2026-01-16" }),
        record({ id: "r3", vehicle_id: "local-vehicle-1", date: "2026-01-17" }),
      ],
    });
    const plan = planRestore(backup, [vehicle(UUID_A, "メインカー")], []);
    const finalized = finalizeRestoreRecords(plan, { "local-vehicle-1": UUID_X });
    expect(finalized.map(r => r.vehicle_id)).toEqual([UUID_A, UUID_A, UUID_X]);
  });

  it("falls back to the existing default vehicle when the backup has no vehicles", () => {
    const backup = validBackup({ vehicles: [], records: [record({ vehicle_id: null })] });
    const plan = planRestore(backup, [vehicle(UUID_B, "A"), vehicle(UUID_C, "B")], []);
    expect(plan.defaultVehicleId).toBe(UUID_B);
    expect(finalizeRestoreRecords(plan, {})[0].vehicle_id).toBe(UUID_B);
  });

  it("skips records whose id already exists", () => {
    const backup = validBackup({ records: [record({ id: "same" }), record({ id: "new", date: "2026-03-01" })] });
    const plan = planRestore(backup, [vehicle(UUID_A, "メインカー")], [
      record({ id: "same", vehicle_id: UUID_B, date: "1999-01-01" }),
    ]);
    expect(plan.counts).toMatchObject({ recordsNew: 1, recordsSkipped: 1 });
    expect(plan.records.map(r => r.date)).toEqual(["2026-03-01"]);
  });

  it("skips records that match vehicle + date + fuel(±0.01) + cost", () => {
    const backup = validBackup({
      vehicles: [{ id: "default-car", name: "メインカー", type: "car" }],
      records: [
        record({ id: "a", vehicle_id: "default-car", fuel_amount: 30.005, total_cost: 5100 }), // 重複
        record({ id: "b", vehicle_id: "default-car", fuel_amount: 30.05, total_cost: 5100 }), // 給油量が違う
        record({ id: "c", vehicle_id: "default-car", fuel_amount: 30, total_cost: 5101 }), // 金額が違う
        record({ id: "d", vehicle_id: "default-car", date: "2026-01-16" }), // 日付が違う
      ],
    });
    const existing = [record({ id: UUID_C, vehicle_id: UUID_A, fuel_amount: 30, total_cost: 5100 })];
    const plan = planRestore(backup, [vehicle(UUID_A, "メインカー")], existing);
    expect(plan.counts).toMatchObject({ recordsNew: 3, recordsSkipped: 1 });
  });

  it("treats null fuel/cost as equal only to null", () => {
    const backup = validBackup({
      records: [
        record({ id: "a", fuel_amount: null, total_cost: null }),
        record({ id: "b", fuel_amount: 30, total_cost: null }),
      ],
    });
    const existing = [record({ id: "e", fuel_amount: null, total_cost: null })];
    const plan = planRestore(backup, [vehicle(UUID_A, "メインカー")], existing);
    expect(plan.counts).toMatchObject({ recordsNew: 1, recordsSkipped: 1 });
  });

  it("does not treat the same tuple on a different vehicle as a duplicate", () => {
    const backup = validBackup({ records: [record({ id: "a", vehicle_id: UUID_A })] });
    const existing = [record({ id: "e", vehicle_id: UUID_B })];
    const plan = planRestore(backup, [vehicle(UUID_A, "メインカー"), vehicle(UUID_B, "別")], existing);
    expect(plan.counts).toMatchObject({ recordsNew: 1, recordsSkipped: 0 });
  });

  it("treats existing unclassified records as belonging to the default vehicle", () => {
    const backup = validBackup({ records: [record({ id: "a", vehicle_id: UUID_A })] });
    const existing = [record({ id: "e", vehicle_id: null })];
    const plan = planRestore(backup, [vehicle(UUID_A, "メインカー")], existing);
    expect(plan.counts).toMatchObject({ recordsNew: 0, recordsSkipped: 1 });
  });

  it("is idempotent: restoring into the data it came from adds nothing", () => {
    const vehicles = [vehicle(UUID_A, "メインカー"), vehicle(UUID_B, "バイク", "bike")];
    const records = [
      record({ id: UUID_C, vehicle_id: UUID_A }),
      record({ id: UUID_X, vehicle_id: UUID_B, date: "2026-02-02" }),
    ];
    const backup = buildBackup(vehicles, records);
    const plan = planRestore(backup, vehicles, records);
    expect(plan.counts).toEqual({ vehiclesNew: 0, vehiclesMatched: 2, recordsNew: 0, recordsSkipped: 2 });
  });
});

describe("planRestore with same-name vehicles", () => {
  it("re-restoring adds nothing even if same-name vehicles come back in a different order", () => {
    const backup = validBackup({
      vehicles: [
        { id: "local-vehicle-1", name: "社用車", type: "car" },
        { id: "local-vehicle-2", name: "社用車", type: "car" },
      ],
      records: [
        record({ id: "r1", vehicle_id: "local-vehicle-1", date: "2026-01-10", fuel_amount: 30, total_cost: 5100 }),
        record({ id: "r2", vehicle_id: "local-vehicle-2", date: "2026-01-11", fuel_amount: 20, total_cost: 3400 }),
      ],
    });
    const base = vehicle(UUID_A, "メインカー");

    // 1 回目: 2 台とも新規作成
    const first = planRestore(backup, [base], []);
    expect(first.counts).toMatchObject({ vehiclesNew: 2, recordsNew: 2 });
    const created = Object.create(null) as Record<string, string>;
    created["local-vehicle-1"] = UUID_B;
    created["local-vehicle-2"] = UUID_C;
    const inserted = finalizeRestoreRecords(first, created).map((r, i) => ({ ...r, id: `db-${i}` }));
    expect(inserted.map(r => r.vehicle_id)).toEqual([UUID_B, UUID_C]);

    // 2 回目: 再読み込みで同名車両の並びが入れ替わった（created_at が同じで id 順になった等）
    const shuffled = [base, vehicle(UUID_C, "社用車"), vehicle(UUID_B, "社用車")];
    const second = planRestore(backup, shuffled, inserted);
    expect(second.vehicleIdMap).toEqual({ "local-vehicle-1": UUID_C, "local-vehicle-2": UUID_B });
    expect(second.counts).toEqual({ vehiclesNew: 0, vehiclesMatched: 2, recordsNew: 0, recordsSkipped: 2 });
  });

  it("still checks only the matched vehicle when the name is unique", () => {
    const backup = validBackup({
      vehicles: [{ id: "local-vehicle-1", name: "A", type: "car" }],
      records: [record({ id: "r1", vehicle_id: "local-vehicle-1" })],
    });
    const existing = [record({ id: "e1", vehicle_id: UUID_B })]; // 別名の車両に同じ内容
    const plan = planRestore(backup, [vehicle(UUID_A, "A"), vehicle(UUID_B, "B")], existing);
    expect(plan.counts).toMatchObject({ recordsNew: 1, recordsSkipped: 0 });
  });
});

describe("prototype-like vehicle ids", () => {
  it("keeps records of a vehicle whose id is __proto__ on that vehicle", () => {
    const text = JSON.stringify(
      validBackup({
        vehicles: [
          { id: "default-car", name: "メインカー", type: "car" },
          { id: "__proto__", name: "変な車", type: "car" },
        ],
        records: [record({ id: "r1", vehicle_id: "__proto__" })],
      })
    );
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const plan = planRestore(parsed.backup, [vehicle(UUID_A, "メインカー")], []);
    expect(plan.vehiclesToCreate.map(v => v.backupId)).toEqual(["__proto__"]);
    const created = Object.create(null) as Record<string, string>;
    created["__proto__"] = UUID_X;
    expect(finalizeRestoreRecords(plan, created)[0].vehicle_id).toBe(UUID_X);

    // 既存車両に id で一致する場合も対応表から失われない
    const matched = planRestore(parsed.backup, [vehicle(UUID_A, "メインカー"), vehicle("__proto__", "変な車")], []);
    expect(Object.prototype.hasOwnProperty.call(matched.vehicleIdMap, "__proto__")).toBe(true);
    expect(finalizeRestoreRecords(matched, {})[0].vehicle_id).toBe("__proto__");
  });
});
