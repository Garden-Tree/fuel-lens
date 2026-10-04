import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LOCAL_DEFAULT_VEHICLE_ID,
  LOCAL_RECORDS_KEY,
  LOCAL_VEHICLES_KEY,
  ensureDefaultVehicle,
  migrateLocalData,
  withStatus,
} from "@/lib/migrateLocalData";

// ---------------------------------------------------------------------------
// localStorage / window stubs
// ---------------------------------------------------------------------------

function makeLocalStorage() {
  const store = new Map<string, string>();
  return {
    store,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
}

// ---------------------------------------------------------------------------
// Fake supabase client
//
// supabase.from(table).select().order() / .insert().select().single() / .insert()
// のチェーンを記録し、await 時に handler(query) の結果を返す thenable。
// ---------------------------------------------------------------------------

type Query = { table: string; ops: Array<{ name: string; args: unknown[] }> };
type QueryResult = { data?: unknown; error?: unknown; status?: number };
type Handler = (q: Query) => QueryResult | Promise<QueryResult>;

/** users テーブル（ensureUserRow の upsert）は既定で成功を返す。失敗させたいテストは usersHandler を渡す。 */
const usersOk: Handler = () => ({ data: null, error: null, status: 201 });

function makeSupabase(handler: Handler, usersHandler: Handler = usersOk) {
  const queries: Query[] = [];
  const from = (table: string) => {
    const q: Query = { table, ops: [] };
    queries.push(q);
    const chain: Record<string, unknown> = {};
    for (const name of ["select", "order", "insert", "upsert", "single", "eq"]) {
      chain[name] = (...args: unknown[]) => {
        q.ops.push({ name, args });
        return chain;
      };
    }
    chain.then = (onOk: (v: QueryResult) => unknown, onErr?: (e: unknown) => unknown) =>
      Promise.resolve()
        .then(() => (q.table === "users" ? usersHandler(q) : handler(q)))
        .then(onOk, onErr);
    return chain;
  };
  return { client: { from } as unknown as SupabaseClient, queries };
}

function op(q: Query, name: string) {
  return q.ops.find((o) => o.name === name);
}

const UUID_DEFAULT = "11111111-1111-4111-8111-111111111111";
const UUID_BIKE = "22222222-2222-4222-8222-222222222222";

/** 一般的な「クラウドは空」のハンドラ: vehicles select → [], insert → 連番 uuid, fuel_records insert → ok */
function cloudEmptyHandler() {
  const insertedVehicles: Array<Record<string, unknown>> = [];
  const insertedRecords: Array<Record<string, unknown>> = [];
  let n = 0;
  const handler: Handler = (q) => {
    if (q.table === "vehicles") {
      if (op(q, "select") && !op(q, "insert")) return { data: [], error: null, status: 200 };
      const row = op(q, "insert")!.args[0] as Record<string, unknown>;
      n += 1;
      const id = n === 1 ? UUID_DEFAULT : UUID_BIKE;
      const inserted = { id, created_at: `2026-10-0${n}T00:00:00Z`, ...row };
      insertedVehicles.push(inserted);
      return { data: inserted, error: null, status: 201 };
    }
    if (q.table === "fuel_records") {
      const rows = op(q, "insert")!.args[0] as Array<Record<string, unknown>>;
      insertedRecords.push(...rows);
      return { data: null, error: null, status: 201 };
    }
    throw new Error(`unexpected table ${q.table}`);
  };
  return { handler, insertedVehicles, insertedRecords };
}

let localStorageStub: ReturnType<typeof makeLocalStorage>;
let userSeq = 0;
const nextUser = () => `user-${Date.now()}-${++userSeq}`;

beforeEach(() => {
  localStorageStub = makeLocalStorage();
  vi.stubGlobal("localStorage", localStorageStub);
  // migrateLocalData は `typeof window === "undefined"` で SSR 判定しているので最小限の window を置く
  vi.stubGlobal("window", {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------

describe("withStatus", () => {
  it("attaches status when missing and keeps an existing numeric status", () => {
    expect(withStatus({ message: "x" }, 503)).toEqual({ message: "x", status: 503 });
    expect(withStatus({ message: "x", status: 401 }, 503)).toEqual({ message: "x", status: 401 });
    expect(withStatus({ message: "x" }, undefined)).toEqual({ message: "x" });
  });

  it("does not throw on frozen errors", () => {
    const frozen = Object.freeze({ message: "x" });
    expect(() => withStatus(frozen, 500)).not.toThrow();
  });
});

describe("migrateLocalData — guards", () => {
  it("resolves to a no-op result without touching supabase when there is no window", async () => {
    vi.stubGlobal("window", undefined);
    const { client, queries } = makeSupabase(() => ({ data: [] }));
    const r = await migrateLocalData(client, nextUser());
    expect(r).toEqual({ migratedVehicles: 0, migratedRecords: 0, didWrite: false });
    expect(queries).toHaveLength(0);
  });

  it("resolves to a no-op result for an empty userId", async () => {
    const { client, queries } = makeSupabase(() => ({ data: [] }));
    const r = await migrateLocalData(client, "");
    expect(r.didWrite).toBe(false);
    expect(queries).toHaveLength(0);
  });

  it("resolves to a no-op result when localStorage has nothing to migrate", async () => {
    const { client, queries } = makeSupabase(() => ({ data: [] }));
    const r = await migrateLocalData(client, nextUser());
    expect(r).toEqual({ migratedVehicles: 0, migratedRecords: 0, didWrite: false });
    expect(queries).toHaveLength(0);
  });

  it("cleans up unparsable local data without calling supabase", async () => {
    localStorageStub.setItem(LOCAL_RECORDS_KEY, "{not json");
    localStorageStub.setItem(LOCAL_VEHICLES_KEY, '{"not":"an array"}');
    const { client, queries } = makeSupabase(() => ({ data: [] }));
    const r = await migrateLocalData(client, nextUser());
    expect(r.didWrite).toBe(false);
    expect(queries).toHaveLength(0);
    expect(localStorageStub.store.size).toBe(0);
  });
});

describe("migrateLocalData — in-flight lock", () => {
  it("returns the same promise for concurrent calls with the same userId", async () => {
    localStorageStub.setItem(LOCAL_RECORDS_KEY, JSON.stringify([{ date: "2026-10-01", fuel_amount: 10 }]));

    // vehicles の select を手動で解決するまで止めておき、移行を in-flight のままにする
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { handler } = cloudEmptyHandler();
    const { client, queries } = makeSupabase(async (q) => {
      if (q.table === "vehicles" && !op(q, "insert")) await gate;
      return handler(q);
    });

    const userId = nextUser();
    const p1 = migrateLocalData(client, userId);
    const p2 = migrateLocalData(client, userId);
    const p3 = migrateLocalData(client, userId);
    expect(p2).toBe(p1);
    expect(p3).toBe(p1);

    release();
    const r = await p1;
    expect(r).toEqual({ migratedVehicles: 0, migratedRecords: 1, didWrite: true });
    // 1 回分の select + 1 回分の既定車両 insert + 1 回分の records insert
    expect(queries.filter((q) => q.table === "fuel_records")).toHaveLength(1);

    // 完了後はロックが解放され、次の呼び出しは新しい Promise になる
    const p4 = migrateLocalData(client, userId);
    expect(p4).not.toBe(p1);
    await expect(p4).resolves.toEqual({ migratedVehicles: 0, migratedRecords: 0, didWrite: false });
  });

  it("uses separate promises for different userIds", async () => {
    const { handler } = cloudEmptyHandler();
    const { client } = makeSupabase(handler);
    const a = migrateLocalData(client, nextUser());
    const b = migrateLocalData(client, nextUser());
    expect(a).not.toBe(b);
    await Promise.all([a, b]);
  });
});

describe("migrateLocalData — happy path", () => {
  it("creates the default vehicle from the local default, inserts other vehicles and remaps records", async () => {
    localStorageStub.setItem(
      LOCAL_VEHICLES_KEY,
      JSON.stringify([
        { id: LOCAL_DEFAULT_VEHICLE_ID, name: "  うちの車  ", type: "car" },
        { id: "local-vehicle-1", name: "バイク", type: "bike" },
        { id: "local-vehicle-1", name: "重複", type: "car" }, // 同一 id は先勝ち
        { id: "", name: "invalid" }, // id なしは無視
      ])
    );
    localStorageStub.setItem(
      LOCAL_RECORDS_KEY,
      JSON.stringify([
        { date: "2026-09-01", vehicle_id: LOCAL_DEFAULT_VEHICLE_ID, fuel_amount: 40, total_cost: 6000, total_distance: 500, fuel_efficiency: 12.5, price_per_unit: 150, gas_station: "ENEOS", created_at: "2026-09-01T10:00:00.000Z" },
        { date: "2026-09-02", vehicle_id: "local-vehicle-1", fuel_amount: 10, total_cost: 1500, created_at: "not a date" },
        { date: "2026-09-03", fuel_amount: "12", total_cost: null }, // vehicle_id なし → 既定車両、数値文字列は null
        null, // 不正な要素はスキップ
      ])
    );

    const { handler, insertedVehicles, insertedRecords } = cloudEmptyHandler();
    const { client } = makeSupabase(handler);
    const userId = nextUser();

    const r = await migrateLocalData(client, userId);
    expect(r).toEqual({ migratedVehicles: 1, migratedRecords: 3, didWrite: true });

    // 既定車両はローカルの default-car の名前/種別で作成される
    expect(insertedVehicles).toHaveLength(2);
    expect(insertedVehicles[0]).toMatchObject({ id: UUID_DEFAULT, user_id: userId, name: "うちの車", type: "car" });
    expect(insertedVehicles[1]).toMatchObject({ id: UUID_BIKE, user_id: userId, name: "バイク", type: "bike" });

    expect(insertedRecords).toHaveLength(3);
    expect(insertedRecords[0]).toEqual({
      user_id: userId,
      vehicle_id: UUID_DEFAULT,
      date: "2026-09-01",
      total_distance: 500,
      fuel_amount: 40,
      gas_station: "ENEOS",
      price_per_unit: 150,
      total_cost: 6000,
      fuel_efficiency: 12.5,
      created_at: "2026-09-01T10:00:00.000Z",
    });
    expect(insertedRecords[1]).toMatchObject({ vehicle_id: UUID_BIKE, date: "2026-09-02", fuel_amount: 10 });
    // 無効な created_at は送らずに省くのではなく、date のローカル 0:00 で補う（混在チャンクの NULL 化を防ぐ）
    expect(insertedRecords[1].created_at).toBe(new Date(2026, 8, 2).toISOString());
    expect(insertedRecords[2]).toMatchObject({ vehicle_id: UUID_DEFAULT, date: "2026-09-03", fuel_amount: null, total_cost: null });

    // ローカルの元キー・退避キー・対応表はすべて削除される
    expect(localStorageStub.store.size).toBe(0);
  });

  it("keeps records attached to an existing cloud vehicle uuid", async () => {
    localStorageStub.setItem(LOCAL_RECORDS_KEY, JSON.stringify([{ date: "2026-09-01", vehicle_id: UUID_BIKE, fuel_amount: 5 }]));
    const { client } = makeSupabase((q) => {
      if (q.table === "vehicles") {
        return {
          data: [
            { id: UUID_DEFAULT, name: "A", type: "car", created_at: "2026-01-01" },
            { id: UUID_BIKE, name: "B", type: "bike", created_at: "2026-01-02" },
          ],
          status: 200,
        };
      }
      const rows = op(q, "insert")!.args[0] as Array<Record<string, unknown>>;
      expect(rows[0].vehicle_id).toBe(UUID_BIKE);
      return { status: 201 };
    });
    const r = await migrateLocalData(client, nextUser());
    expect(r).toEqual({ migratedVehicles: 0, migratedRecords: 1, didWrite: true });
  });
});

describe("migrateLocalData — failure / retry", () => {
  it("restores local data when the records insert fails and remembers inserted vehicles for the retry", async () => {
    // default-car を含める（含めないと「既定車両を削除済み」扱いになり、local-vehicle-1 が既定車両の種になる。
    // そのケースは "deleted default-car" の describe で検証している）
    const vehicles = [
      { id: LOCAL_DEFAULT_VEHICLE_ID, name: "メインカー", type: "car" },
      { id: "local-vehicle-1", name: "バイク", type: "bike" },
    ];
    const records = [{ date: "2026-09-02", vehicle_id: "local-vehicle-1", fuel_amount: 10 }];
    localStorageStub.setItem(LOCAL_VEHICLES_KEY, JSON.stringify(vehicles));
    localStorageStub.setItem(LOCAL_RECORDS_KEY, JSON.stringify(records));

    const base = cloudEmptyHandler();
    const { client } = makeSupabase((q) => {
      if (q.table === "fuel_records") return { error: { message: "boom" }, status: 500 };
      return base.handler(q);
    });
    const userId = nextUser();

    await expect(migrateLocalData(client, userId)).rejects.toMatchObject({ message: "boom", status: 500 });

    // 元キーへ復元され、次回ログインで再試行できる
    expect(JSON.parse(localStorageStub.getItem(LOCAL_RECORDS_KEY)!)).toEqual(records);
    expect(JSON.parse(localStorageStub.getItem(LOCAL_VEHICLES_KEY)!)).toEqual(vehicles);
    expect(localStorageStub.getItem(`${LOCAL_RECORDS_KEY}_migrating_${userId}`)).toBeNull();
    // 車両の対応表は残り、再試行で二重登録しない
    const map = JSON.parse(localStorageStub.getItem(`fuel_lens_migration_vehicle_map_${userId}`)!);
    expect(map).toEqual({ [LOCAL_DEFAULT_VEHICLE_ID]: UUID_DEFAULT, "local-vehicle-1": UUID_BIKE });

    // --- 再試行: クラウドには既に 2 台ある。車両は挿入されず、記録だけ入る ---
    const retry = cloudEmptyHandler();
    const { client: client2, queries } = makeSupabase((q) => {
      if (q.table === "vehicles" && !op(q, "insert")) {
        return { data: base.insertedVehicles, status: 200 };
      }
      return retry.handler(q);
    });
    const r = await migrateLocalData(client2, userId);
    expect(r).toEqual({ migratedVehicles: 0, migratedRecords: 1, didWrite: true });
    expect(queries.filter((q) => q.table === "vehicles" && op(q, "insert"))).toHaveLength(0);
    expect(retry.insertedRecords[0]).toMatchObject({ vehicle_id: UUID_BIKE });
    expect(localStorageStub.store.size).toBe(0);
  });
});

describe("migrateLocalData — payload normalization", () => {
  it("sends created_at for every row of a chunk mixing old and new records, with defaultToNull: false", async () => {
    const records = [
      { date: "2024-01-05", fuel_amount: 30 }, // 旧形式: created_at なし
      { date: "2026-09-01", fuel_amount: 40, created_at: "2026-09-01T10:00:00.000Z" },
      { date: "2025-03-10", fuel_amount: 20, created_at: "" },
      { date: "2025-03-11", fuel_amount: 20, created_at: 12345 },
    ];
    localStorageStub.setItem(LOCAL_RECORDS_KEY, JSON.stringify(records));

    const { handler, insertedRecords } = cloudEmptyHandler();
    const { client, queries } = makeSupabase(handler);
    const r = await migrateLocalData(client, nextUser());
    expect(r.migratedRecords).toBe(4);

    const recordInserts = queries.filter((q) => q.table === "fuel_records");
    expect(recordInserts).toHaveLength(1);
    expect(op(recordInserts[0], "insert")!.args[1]).toEqual({ defaultToNull: false });

    expect(insertedRecords).toHaveLength(4);
    for (const row of insertedRecords) {
      expect(typeof row.created_at).toBe("string");
      expect(Number.isNaN(Date.parse(row.created_at as string))).toBe(false);
    }
    expect(insertedRecords[0].created_at).toBe(new Date(2024, 0, 5).toISOString());
    expect(insertedRecords[1].created_at).toBe("2026-09-01T10:00:00.000Z");
    expect(insertedRecords[2].created_at).toBe(new Date(2025, 2, 10).toISOString());
    expect(insertedRecords[3].created_at).toBe(new Date(2025, 2, 11).toISOString());
  });

  it("replaces invalid dates with the created_at date, else today", async () => {
    const localDate = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const createdAt = "2025-06-15T03:00:00.000Z";
    const records = [
      { date: "", fuel_amount: 1 },
      { date: "不明", fuel_amount: 2 },
      { date: "2024-02-30", fuel_amount: 3 },
      { date: "2024-02-30", fuel_amount: 4, created_at: createdAt },
      { fuel_amount: 5 }, // date なし
      { date: "2024-02-29", fuel_amount: 6 }, // うるう日は有効
    ];
    localStorageStub.setItem(LOCAL_RECORDS_KEY, JSON.stringify(records));

    const { handler, insertedRecords } = cloudEmptyHandler();
    const { client } = makeSupabase(handler);
    const before = localDate(new Date());
    await migrateLocalData(client, nextUser());
    const after = localDate(new Date());

    const dates = insertedRecords.map((row) => row.date as string);
    for (const d of dates) expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const i of [0, 1, 2, 4]) expect([before, after]).toContain(dates[i]);
    expect(dates[3]).toBe(localDate(new Date(createdAt)));
    expect(insertedRecords[3].created_at).toBe(createdAt);
    expect(dates[5]).toBe("2024-02-29");
  });
});

describe("migrateLocalData — deleted default-car", () => {
  it("seeds the cloud default vehicle from the first local vehicle instead of creating a phantom メインカー", async () => {
    localStorageStub.setItem(
      LOCAL_VEHICLES_KEY,
      JSON.stringify([
        { id: "local-vehicle-1", name: "スクーター", type: "bike" },
        { id: "local-vehicle-2", name: "軽トラ", type: "car" },
      ])
    );
    localStorageStub.setItem(
      LOCAL_RECORDS_KEY,
      JSON.stringify([
        { date: "2026-09-01", vehicle_id: "local-vehicle-1", fuel_amount: 5 },
        { date: "2026-09-02", vehicle_id: "local-vehicle-2", fuel_amount: 30 },
        { date: "2026-09-03", fuel_amount: 6 }, // 未分類 → 先頭車両
      ])
    );

    const { handler, insertedVehicles, insertedRecords } = cloudEmptyHandler();
    const { client } = makeSupabase(handler);
    const userId = nextUser();
    const r = await migrateLocalData(client, userId);

    expect(insertedVehicles).toHaveLength(2);
    expect(insertedVehicles.some((v) => v.name === "メインカー")).toBe(false);
    expect(insertedVehicles[0]).toMatchObject({ id: UUID_DEFAULT, name: "スクーター", type: "bike" });
    expect(insertedVehicles[1]).toMatchObject({ id: UUID_BIKE, name: "軽トラ", type: "car" });
    expect(r).toEqual({ migratedVehicles: 2, migratedRecords: 3, didWrite: true });

    expect(insertedRecords.map((row) => row.vehicle_id)).toEqual([UUID_DEFAULT, UUID_BIKE, UUID_DEFAULT]);
    expect(localStorageStub.store.size).toBe(0);
  });

  it("does not insert the seeded vehicle again on retry after a records failure", async () => {
    const vehicles = [
      { id: "local-vehicle-1", name: "スクーター", type: "bike" },
      { id: "local-vehicle-2", name: "軽トラ", type: "car" },
    ];
    localStorageStub.setItem(LOCAL_VEHICLES_KEY, JSON.stringify(vehicles));
    localStorageStub.setItem(LOCAL_RECORDS_KEY, JSON.stringify([{ date: "2026-09-01", vehicle_id: "local-vehicle-1" }]));

    const base = cloudEmptyHandler();
    const { client } = makeSupabase((q) => {
      if (q.table === "fuel_records") return { error: { message: "boom" }, status: 400 };
      return base.handler(q);
    });
    const userId = nextUser();
    await expect(migrateLocalData(client, userId)).rejects.toMatchObject({ message: "boom" });
    expect(base.insertedVehicles).toHaveLength(2);

    const retry = cloudEmptyHandler();
    const { client: client2, queries } = makeSupabase((q) => {
      if (q.table === "vehicles" && !op(q, "insert")) return { data: base.insertedVehicles, status: 200 };
      return retry.handler(q);
    });
    await migrateLocalData(client2, userId);
    expect(queries.filter((q) => q.table === "vehicles" && op(q, "insert"))).toHaveLength(0);
    expect(retry.insertedRecords[0]).toMatchObject({ vehicle_id: UUID_DEFAULT });
  });
});

describe("migrateLocalData — users row (FK)", () => {
  it("upserts only { id } into users before the first vehicles insert", async () => {
    localStorageStub.setItem(LOCAL_VEHICLES_KEY, JSON.stringify([{ id: LOCAL_DEFAULT_VEHICLE_ID, name: "車", type: "car" }]));
    localStorageStub.setItem(LOCAL_RECORDS_KEY, JSON.stringify([{ date: "2026-09-01", fuel_amount: 1 }]));
    const { handler } = cloudEmptyHandler();
    const { client, queries } = makeSupabase(handler);
    const userId = nextUser();
    await migrateLocalData(client, userId);

    const usersIdx = queries.findIndex((q) => q.table === "users");
    const firstVehicleInsertIdx = queries.findIndex((q) => q.table === "vehicles" && op(q, "insert"));
    const firstRecordInsertIdx = queries.findIndex((q) => q.table === "fuel_records");
    expect(usersIdx).toBeGreaterThanOrEqual(0);
    expect(firstVehicleInsertIdx).toBeGreaterThan(usersIdx);
    expect(firstRecordInsertIdx).toBeGreaterThan(usersIdx);
    expect(op(queries[usersIdx], "upsert")!.args).toEqual([{ id: userId }, { onConflict: "id", ignoreDuplicates: true }]);
    // タブ内では userId ごとに 1 回だけ
    expect(queries.filter((q) => q.table === "users")).toHaveLength(1);
  });

  it("restores local data and rethrows with status when the users upsert fails, then retries next time", async () => {
    const records = [{ date: "2026-09-01", fuel_amount: 1 }];
    localStorageStub.setItem(LOCAL_RECORDS_KEY, JSON.stringify(records));
    const { handler } = cloudEmptyHandler();
    const { client, queries } = makeSupabase(handler, () => ({ error: { message: "rls" }, status: 403 }));
    const userId = nextUser();

    await expect(migrateLocalData(client, userId)).rejects.toMatchObject({ message: "rls", status: 403 });
    expect(queries.some((q) => q.table === "vehicles" && op(q, "insert"))).toBe(false);
    expect(JSON.parse(localStorageStub.getItem(LOCAL_RECORDS_KEY)!)).toEqual(records);

    // 失敗はキャッシュされず、次回は再び upsert する
    const ok = cloudEmptyHandler();
    const { client: client2, queries: queries2 } = makeSupabase(ok.handler);
    await expect(migrateLocalData(client2, userId)).resolves.toMatchObject({ migratedRecords: 1 });
    expect(queries2.filter((q) => q.table === "users")).toHaveLength(1);
  });
});

describe("ensureDefaultVehicle", () => {
  it("returns existing vehicles without inserting", async () => {
    const existing = [{ id: UUID_DEFAULT, name: "A", type: "car", created_at: "2026-01-01" }];
    const { client, queries } = makeSupabase(() => ({ data: existing, status: 200 }));
    await expect(ensureDefaultVehicle(client, nextUser())).resolves.toEqual(existing);
    expect(queries).toHaveLength(1);
    expect(op(queries[0], "order")?.args).toEqual(["created_at", { ascending: true }]);
    // created_at が同じレガシー行でも先頭が安定するよう id を第 2 キーにする
    expect(queries[0].ops.filter((o) => o.name === "order").map((o) => o.args[0])).toEqual(["created_at", "id"]);
  });

  it("creates the default vehicle (with seed) when none exist and shares one promise per user", async () => {
    const { handler, insertedVehicles } = cloudEmptyHandler();
    const { client, queries } = makeSupabase(handler);
    const userId = nextUser();
    const p1 = ensureDefaultVehicle(client, userId, { name: "My Car", type: "bike" });
    const p2 = ensureDefaultVehicle(client, userId);
    expect(p2).toBe(p1);
    const list = await p1;
    expect(list).toHaveLength(1);
    expect(insertedVehicles[0]).toMatchObject({ user_id: userId, name: "My Car", type: "bike" });
    // select + users 行の確保（FK 対策）+ insert
    expect(queries.map((q) => q.table)).toEqual(["vehicles", "users", "vehicles"]);
  });

  it("rethrows select errors with status attached", async () => {
    const { client } = makeSupabase(() => ({ error: { message: "paused" }, status: 540 }));
    await expect(ensureDefaultVehicle(client, nextUser())).rejects.toMatchObject({ message: "paused", status: 540 });
  });
});
