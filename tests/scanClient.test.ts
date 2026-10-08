import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// node 環境ではブラウザ向けの圧縮ライブラリを読み込まない（requestAnalyze には不要）
vi.mock("browser-image-compression", () => ({ default: vi.fn() }));

import {
  ANALYZE_NETWORK_ERROR_MESSAGE,
  ANALYZE_TIMEOUT_MESSAGE,
  requestAnalyze,
} from "@/lib/scan/analyzeClient";

const DATA_URL = "data:image/jpeg;base64,AAAA";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    ...init,
  });
}

/** signal が abort されるまで解決しない fetch（abort されたら AbortError で reject） */
function hangingFetch() {
  return vi.fn((_url: string, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (signal?.aborted) {
        reject(new DOMException("The operation was aborted.", "AbortError"));
        return;
      }
      signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")));
    });
  });
}

describe("requestAnalyze", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    consoleError.mockRestore();
  });

  it("画像を JSON で POST し、成功時は本文を返す", async () => {
    const body = { date: "2026-10-01", fuel_amount: 30, requestId: "r1" };
    const fetchMock = vi.fn(async () => jsonResponse(body));
    vi.stubGlobal("fetch", fetchMock);

    const res = await requestAnalyze(DATA_URL);
    expect(res).toEqual({ ok: true, status: 200, body, retryAfter: null });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/analyze");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(String(init.body))).toEqual({ image: DATA_URL });
  });

  it("HTTP エラーは投げずにステータス・本文・Retry-After を返す", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "混雑しています。", requestId: "r2" }, { status: 429, headers: { "Retry-After": "12" } }))
    );
    const res = await requestAnalyze(DATA_URL);
    expect(res).toEqual({
      ok: false,
      status: 429,
      body: { error: "混雑しています。", requestId: "r2" },
      retryAfter: "12",
    });
  });

  it("本文が JSON でなければ body は null", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>Bad Gateway</html>", { status: 502 })));
    const res = await requestAnalyze(DATA_URL);
    expect(res).toEqual({ ok: false, status: 502, body: null, retryAfter: null });
  });

  it("接続に失敗したら日本語メッセージで投げる", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    await expect(requestAnalyze(DATA_URL)).rejects.toThrow(ANALYZE_NETWORK_ERROR_MESSAGE);
  });

  it("タイムアウトしたらリクエストを中断し、日本語メッセージで投げる", async () => {
    vi.useFakeTimers();
    const fetchMock = hangingFetch();
    vi.stubGlobal("fetch", fetchMock);

    const promise = requestAnalyze(DATA_URL, { timeoutMs: 1000 });
    const assertion = expect(promise).rejects.toThrow(ANALYZE_TIMEOUT_MESSAGE);
    await vi.advanceTimersByTimeAsync(999);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
    expect(init.signal?.aborted).toBe(true);
  });

  it("呼び出し側の中断は AbortError のまま投げる（タイムアウトの文言にしない）", async () => {
    vi.stubGlobal("fetch", hangingFetch());
    const controller = new AbortController();
    const promise = requestAnalyze(DATA_URL, { signal: controller.signal, timeoutMs: 60_000 });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });

  it("中断済みの signal を渡したら fetch の signal も中断済み", async () => {
    const fetchMock = hangingFetch();
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    controller.abort();
    const promise = requestAnalyze(DATA_URL, { signal: controller.signal });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal?.aborted).toBe(true);
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });
});
