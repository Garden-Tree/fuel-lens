import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalyzeSuccessResponse } from "@/lib/analyze";
import type { AnalyzeHttpResult } from "@/lib/scan/analyzeClient";
import { MAX_RATE_LIMIT_RETRIES, PACER_WINDOW_MS } from "@/lib/scan/batch";
import { createBatchController, type BatchEnd, type BatchState } from "@/lib/scan/batchController";

function result(date: string): AnalyzeSuccessResponse {
  return {
    date,
    fuel_amount: 30,
    total_cost: 4800,
    price_per_unit: 160,
    total_distance: null,
    odometer: null,
    gas_station: null,
    fuel_type: null,
    requestId: "req",
  };
}

const ok = (dataUrl: string): AnalyzeHttpResult => ({ ok: true, status: 200, body: result(dataUrl), retryAfter: null, trialRemaining: null });

function makeFiles(n: number): File[] {
  return Array.from({ length: n }, (_, i) => new File(["x"], `r${i}.jpg`, { type: "image/jpeg" }));
}

type AnalyzeImpl = (dataUrl: string, signal: AbortSignal) => Promise<AnalyzeHttpResult>;

function setup(n: number, analyzeImpl: AnalyzeImpl = async (d) => ok(d)) {
  const compress = vi.fn(async (f: File) => `data:${f.name}`);
  const analyze = vi.fn(analyzeImpl);
  const ends: BatchEnd[] = [];
  let state: BatchState | null = null;
  const controller = createBatchController(
    makeFiles(n),
    { compress, analyze, isSignedIn: true },
    { onChange: (s) => (state = s), onEnd: (e) => ends.push(e) }
  );
  return {
    controller,
    compress,
    analyze,
    ends,
    state: () => state ?? controller.getState(),
    statuses: () => (state ?? controller.getState()).items.map((i) => i.status),
    /** analyze に渡された画像（呼ばれた順） */
    requested: () => analyze.mock.calls.map((c) => c[0]),
  };
}

/** 中断されるまで返らない解析（中断で AbortError） */
const hanging: AnalyzeImpl = (_d, signal) =>
  new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  });

const flush = () => vi.advanceTimersByTimeAsync(0);

describe("createBatchController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-15T09:00:00"));
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("選んだ順に読み取り、確認中の 1 枚の次の 1 枚までしか先読みしない", async () => {
    const t = setup(4);
    t.controller.start();
    await flush();
    expect(t.requested()).toEqual(["data:r0.jpg", "data:r1.jpg"]);
    expect(t.statuses()).toEqual(["ready", "ready", "pending", "pending"]);
    expect(t.state().items[0].result?.date).toBe("data:r0.jpg");

    t.controller.markSaved();
    await flush();
    expect(t.state().current).toBe(1);
    expect(t.requested()).toEqual(["data:r0.jpg", "data:r1.jpg", "data:r2.jpg"]);

    t.controller.skip();
    await flush();
    t.controller.markSaved();
    await flush();
    t.controller.markSaved();
    await flush();
    expect(t.requested()).toHaveLength(4);
    expect(t.statuses()).toEqual(["saved", "skipped", "saved", "saved"]);
    expect(t.ends).toEqual([{ reason: "finished", total: 4, saved: 3, skipped: 1, cancelled: 0, message: null }]);
    expect(t.state().phase).toBe("finished");
  });

  it("読み取り中の写真をスキップすると、そのリクエストを中断して次の写真へ進む", async () => {
    let first = true;
    const t = setup(2, (d, signal) => {
      if (first) {
        first = false;
        return hanging(d, signal);
      }
      return Promise.resolve(ok(d));
    });
    t.controller.start();
    await flush();
    expect(t.statuses()).toEqual(["analyzing", "pending"]);
    const signal = t.analyze.mock.calls[0][1];

    t.controller.skip();
    await flush();
    expect(signal.aborted).toBe(true);
    expect(t.statuses()).toEqual(["skipped", "ready"]);
    expect(t.state().current).toBe(1);
    expect(t.requested()).toEqual(["data:r0.jpg", "data:r1.jpg"]);
  });

  it("429 は Retry-After だけ待ち（残り秒数を知らせる）、自動で再試行する", async () => {
    let calls = 0;
    const t = setup(2, async (d) => {
      calls += 1;
      return calls === 1 ? { ok: false, status: 429, body: { error: "多すぎ" }, retryAfter: "3", trialRemaining: null } : ok(d);
    });
    t.controller.start();
    await flush();
    expect(t.analyze).toHaveBeenCalledTimes(1);
    expect(t.state().items[0]).toMatchObject({ status: "waiting", waitMs: 3000 });

    await vi.advanceTimersByTimeAsync(1000);
    expect(t.state().items[0]).toMatchObject({ status: "waiting", waitMs: 2000 });
    expect(t.analyze).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2000);
    expect(t.requested()).toEqual(["data:r0.jpg", "data:r0.jpg", "data:r1.jpg"]);
    expect(t.statuses()).toEqual(["ready", "ready"]);
  });

  it("Retry-After が無い 429 は 30 秒待つ", async () => {
    let calls = 0;
    const t = setup(1, async (d) => {
      calls += 1;
      return calls === 1 ? { ok: false, status: 429, body: null, retryAfter: null, trialRemaining: null } : ok(d);
    });
    t.controller.start();
    await flush();
    expect(t.state().items[0]).toMatchObject({ status: "waiting", waitMs: 30_000 });
    await vi.advanceTimersByTimeAsync(29_999);
    expect(t.analyze).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(t.analyze).toHaveBeenCalledTimes(2);
  });

  it("429 が続いたら再試行をやめ、その写真を読み取れなかった扱いにする（手入力かスキップ）", async () => {
    const t = setup(1, async () => ({ ok: false, status: 429, body: null, retryAfter: "1", trialRemaining: null }));
    t.controller.start();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(t.analyze).toHaveBeenCalledTimes(MAX_RATE_LIMIT_RETRIES + 1);
    expect(t.state().items[0].status).toBe("failed");
    expect(t.state().items[0].error).toContain("約1秒後に");
  });

  it("直近 62 秒に 5 回までにペース配分し、6 回目は待ってから送る", async () => {
    const t = setup(7);
    t.controller.start();
    await flush();
    // 保存するたびに 1 枚ずつ先読みが進む
    for (let i = 0; i < 4; i += 1) {
      t.controller.markSaved();
      await flush();
    }
    expect(t.analyze).toHaveBeenCalledTimes(5);
    // 確認中は 4 枚目（index 4）、6 枚目（index 5）は回数制限の待ち
    expect(t.state().current).toBe(4);
    expect(t.state().items[5]).toMatchObject({ status: "waiting", waitMs: PACER_WINDOW_MS });

    await vi.advanceTimersByTimeAsync(PACER_WINDOW_MS - 1);
    expect(t.analyze).toHaveBeenCalledTimes(5);
    await vi.advanceTimersByTimeAsync(1);
    expect(t.analyze).toHaveBeenCalledTimes(6);
    expect(t.state().items[5].status).toBe("ready");
  });

  it("中止すると進行中のリクエストと待ちを止め、件数を知らせる。その後は何も送らない", async () => {
    let calls = 0;
    const t = setup(5, (d, signal) => {
      calls += 1;
      return calls === 2 ? hanging(d, signal) : Promise.resolve(ok(d));
    });
    t.controller.start();
    await flush();
    expect(t.statuses().slice(0, 2)).toEqual(["ready", "analyzing"]);
    t.controller.markSaved();
    await flush();
    const signal = t.analyze.mock.calls[1][1];

    t.controller.abort();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(signal.aborted).toBe(true);
    expect(t.analyze).toHaveBeenCalledTimes(2);
    expect(t.state().phase).toBe("aborted");
    expect(t.ends).toEqual([{ reason: "aborted", total: 5, saved: 1, skipped: 0, cancelled: 4, message: null }]);

    // 中止後の操作は無視する
    t.controller.markSaved();
    t.controller.skip();
    t.controller.abort();
    expect(t.ends).toHaveLength(1);
  });

  it("回数制限の待ちの最中に中止しても、待ちが終わったあとに送らない", async () => {
    const t = setup(1, async () => ({ ok: false, status: 429, body: null, retryAfter: "10", trialRemaining: null }));
    t.controller.start();
    await flush();
    expect(t.state().items[0].status).toBe("waiting");
    t.controller.abort();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.analyze).toHaveBeenCalledTimes(1);
  });

  it("401（セッション切れ）は残りを中止し、案内を添えて終える", async () => {
    const t = setup(3, async () => ({ ok: false, status: 401, body: { error: "Unauthorized" }, retryAfter: null, trialRemaining: null }));
    t.controller.start();
    await flush();
    expect(t.analyze).toHaveBeenCalledTimes(1);
    expect(t.ends).toHaveLength(1);
    expect(t.ends[0]).toMatchObject({ reason: "unauthorized", saved: 0, cancelled: 3 });
    expect(t.ends[0].message).toContain("セッション");
  });

  it("読み取れなかった写真（422・通信エラー・圧縮の失敗）は failed になり、手入力して保存（markSaved）できる", async () => {
    const t = setup(2, async (d) =>
      d === "data:r0.jpg"
        ? { ok: false, status: 422, body: { error: "レシート/メーターを読み取れませんでした。" }, retryAfter: null, trialRemaining: null }
        : Promise.reject(new Error("サーバーに接続できませんでした。"))
    );
    t.controller.start();
    await flush();
    expect(t.state().items[0]).toMatchObject({ status: "failed", error: "レシート/メーターを読み取れませんでした。" });
    expect(t.state().items[1]).toMatchObject({ status: "failed", error: "サーバーに接続できませんでした。" });
    t.controller.markSaved();
    t.controller.markSaved();
    expect(t.ends[0]).toMatchObject({ reason: "finished", saved: 2, skipped: 0 });
  });

  it("圧縮に失敗した写真も failed（画像なし）になる", async () => {
    const t = setup(1);
    t.compress.mockRejectedValueOnce(new Error("画像の処理に失敗しました"));
    t.controller.start();
    await flush();
    expect(t.state().items[0]).toMatchObject({ status: "failed", dataUrl: null, error: "画像の処理に失敗しました" });
    expect(t.analyze).not.toHaveBeenCalled();
  });

  it("読み取り中（未確認）の写真は保存済みにできない", async () => {
    const t = setup(2, hanging);
    t.controller.start();
    await flush();
    t.controller.markSaved();
    expect(t.state().current).toBe(0);
  });

  it("dispose（アンマウント）は何も知らせずに止める", async () => {
    const t = setup(2, hanging);
    t.controller.start();
    await flush();
    const signal = t.analyze.mock.calls[0][1];
    t.controller.dispose();
    expect(signal.aborted).toBe(true);
    expect(t.ends).toEqual([]);
  });
});
