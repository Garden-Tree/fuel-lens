import { afterEach, describe, expect, it, vi } from "vitest";
import { DELETE_INCOMPLETE_CODE, deleteOwnData } from "@/lib/data/accountDeletion";
import { DataError } from "@/lib/data/types";
import { clearLocalData, LOCAL_RECORDS_KEY, LOCAL_VEHICLES_KEY } from "@/lib/data/localStore";
import { makeStorage, makeSupabase, op, type Handler } from "./fakeSupabase";

const USER = "user_delete";
const ok: Handler = () => ({ data: [], error: null, status: 200 });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("deleteOwnData", () => {
  it("記録 → 車両 → users 行の順に自分の行を削除し、残りが 0 件であることを確かめる", async () => {
    const { client, queries } = makeSupabase(ok);
    await deleteOwnData(client, USER);

    const summary = queries.map(q => `${q.table}:${q.ops[0].name}`);
    expect(summary).toEqual([
      "fuel_records:delete",
      "vehicles:delete",
      "users:delete",
      "fuel_records:select",
      "vehicles:select",
    ]);
    expect(op(queries[0], "eq")?.args).toEqual(["user_id", USER]);
    expect(op(queries[1], "eq")?.args).toEqual(["user_id", USER]);
    expect(op(queries[2], "eq")?.args).toEqual(["id", USER]);
    // 確認は 1 行だけ読む
    expect(op(queries[3], "range")?.args).toEqual([0, 0]);
    expect(op(queries[4], "eq")?.args).toEqual(["user_id", USER]);
  });

  it("削除の後に行が残っていれば日本語の DataError を投げる", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = makeSupabase(q =>
      q.table === "vehicles" && q.ops[0].name === "select" ? { data: [{ id: "v1" }], error: null, status: 200 } : ok(q)
    );
    const err = await deleteOwnData(client, USER).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DataError);
    expect((err as DataError).code).toBe(DELETE_INCOMPLETE_CODE);
    expect((err as DataError).message).toMatch(/削除しきれませんでした/);
  });

  it("Supabase の失敗は status を付けてそのまま投げ、以降の削除をしない", async () => {
    const pgError = { message: "permission denied", code: "42501" };
    const { client, queries } = makeSupabase(q =>
      q.table === "vehicles" ? { data: null, error: pgError, status: 403 } : ok(q)
    );
    const err = await deleteOwnData(client, USER).catch((e: unknown) => e);
    expect(err).toBe(pgError);
    expect((err as { status?: number }).status).toBe(403);
    expect(queries.map(q => q.table)).toEqual(["fuel_records", "vehicles"]);
  });

  it("userId が空なら何も発行しない", async () => {
    const { client, queries } = makeSupabase(ok);
    await expect(deleteOwnData(client, "")).rejects.toBeInstanceOf(DataError);
    expect(queries).toHaveLength(0);
  });
});

describe("clearLocalData", () => {
  it("未ログイン時の記録と車両のキーだけを消す", () => {
    const { storage, store } = makeStorage({
      [LOCAL_RECORDS_KEY]: "[]",
      [LOCAL_VEHICLES_KEY]: "[]",
      fuel_lens_selected_vehicle_id: "default-car",
    });
    clearLocalData(storage);
    expect(store.has(LOCAL_RECORDS_KEY)).toBe(false);
    expect(store.has(LOCAL_VEHICLES_KEY)).toBe(false);
    expect(store.get("fuel_lens_selected_vehicle_id")).toBe("default-car");
  });

  it("削除に失敗したら日本語の Error を投げる", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { storage } = makeStorage();
    storage.removeItem = () => {
      throw new Error("SecurityError");
    };
    expect(() => clearLocalData(storage)).toThrow(/この端末のデータを削除できませんでした/);
  });
});
