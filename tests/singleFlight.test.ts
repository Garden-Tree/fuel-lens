import { describe, expect, it, vi } from "vitest";
import { singleFlight } from "@/lib/singleFlight";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("singleFlight", () => {
  it("実行中の同じキーの呼び出しは同じ Promise を共有し、fn は 1 回だけ", async () => {
    const map = new Map<string, Promise<number>>();
    const d = deferred<number>();
    const fn = vi.fn(() => d.promise);
    const a = singleFlight(map, "u1", fn);
    const b = singleFlight(map, "u1", fn);
    expect(a).toBe(b);
    expect(a).toBe(d.promise);
    expect(fn).toHaveBeenCalledTimes(1);
    d.resolve(7);
    await expect(a).resolves.toBe(7);
  });

  it("キーが違えば別々に実行する", () => {
    const map = new Map<string, Promise<number>>();
    const fn = vi.fn(() => new Promise<number>(() => {}));
    singleFlight(map, "u1", fn);
    singleFlight(map, "u2", fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("成功したら外し、次の呼び出しでやり直す", async () => {
    const map = new Map<string, Promise<number>>();
    let n = 0;
    const fn = () => Promise.resolve(++n);
    await expect(singleFlight(map, "u1", fn)).resolves.toBe(1);
    await flush();
    expect(map.has("u1")).toBe(false);
    await expect(singleFlight(map, "u1", fn)).resolves.toBe(2);
  });

  it("失敗したら外し（未処理の reject を出さない）、次の呼び出しでやり直す", async () => {
    const map = new Map<string, Promise<number>>();
    const fn = vi.fn().mockRejectedValueOnce(new Error("x")).mockResolvedValueOnce(2);
    await expect(singleFlight(map, "u1", fn)).rejects.toThrow("x");
    await flush();
    expect(map.has("u1")).toBe(false);
    await expect(singleFlight(map, "u1", fn)).resolves.toBe(2);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retainOnSuccess なら成功した Promise を使い回し、失敗したときだけ外す", async () => {
    const map = new Map<string, Promise<void>>();
    const ok = vi.fn(() => Promise.resolve());
    const first = singleFlight(map, "u1", ok, { retainOnSuccess: true });
    await first;
    await flush();
    expect(singleFlight(map, "u1", ok, { retainOnSuccess: true })).toBe(first);
    expect(ok).toHaveBeenCalledTimes(1);

    const ng = vi.fn().mockRejectedValueOnce(new Error("fk")).mockResolvedValueOnce(undefined);
    await expect(singleFlight(map, "u2", ng, { retainOnSuccess: true })).rejects.toThrow("fk");
    await flush();
    expect(map.has("u2")).toBe(false);
    await singleFlight(map, "u2", ng, { retainOnSuccess: true });
    expect(ng).toHaveBeenCalledTimes(2);
  });

  it("実行中に map から外された・差し替えられたエントリは、終わっても消さない", async () => {
    const map = new Map<string, Promise<number>>();
    const d = deferred<number>();
    singleFlight(map, "u1", () => d.promise);
    map.delete("u1");
    const replacement = singleFlight(map, "u1", () => new Promise<number>(() => {}));
    d.resolve(1);
    await flush();
    expect(map.get("u1")).toBe(replacement);
  });
});
