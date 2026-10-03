import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SUPABASE_OUTAGE_EVENT,
  classifySupabaseFailure,
  clearOutage,
  getOutage,
  outageMessage,
  readOnlyError,
  reportSupabaseFailure,
  setOutage,
} from "@/lib/supabaseHealth";

describe("classifySupabaseFailure", () => {
  it("classifies HTTP 540 as paused", () => {
    expect(classifySupabaseFailure(540, null)).toBe("paused");
    expect(classifySupabaseFailure(540, { message: "" })).toBe("paused");
  });

  it('classifies any error whose message mentions "paused" as paused', () => {
    expect(classifySupabaseFailure(null, { message: "Project is PAUSED" })).toBe("paused");
    expect(classifySupabaseFailure(undefined, "project paused")).toBe("paused");
    expect(classifySupabaseFailure(503, new Error("The project is paused"))).toBe("paused");
  });

  it("falls back to error.status when status is not a number", () => {
    expect(classifySupabaseFailure(null, { status: 540 })).toBe("paused");
    expect(classifySupabaseFailure(undefined, { status: 0 })).toBe("unreachable");
    expect(classifySupabaseFailure(undefined, { status: 503 })).toBe("unreachable");
    expect(classifySupabaseFailure(undefined, { status: 401 })).toBeNull();
  });

  it("classifies status 0 (CORS / network failure) as unreachable", () => {
    expect(classifySupabaseFailure(0, null)).toBe("unreachable");
    expect(classifySupabaseFailure(0, { message: "" })).toBe("unreachable");
  });

  it("classifies 5xx as unreachable", () => {
    expect(classifySupabaseFailure(500, { message: "Internal Server Error" })).toBe("unreachable");
    expect(classifySupabaseFailure(502, null)).toBe("unreachable");
    expect(classifySupabaseFailure(503, { message: "Service Unavailable" })).toBe("unreachable");
    expect(classifySupabaseFailure(504, undefined)).toBe("unreachable");
  });

  it("treats 4xx as ordinary application errors (null)", () => {
    expect(classifySupabaseFailure(400, { message: "invalid input syntax" })).toBeNull();
    expect(classifySupabaseFailure(401, { message: "JWT expired" })).toBeNull();
    expect(classifySupabaseFailure(403, { message: "new row violates row-level security policy" })).toBeNull();
    expect(classifySupabaseFailure(404, null)).toBeNull();
    expect(classifySupabaseFailure(409, { message: "duplicate key" })).toBeNull();
  });

  it("classifies network-like exceptions without a status as unreachable", () => {
    expect(classifySupabaseFailure(undefined, new TypeError("Failed to fetch"))).toBe("unreachable");
    expect(classifySupabaseFailure(undefined, new TypeError("anything"))).toBe("unreachable");
    // postgrest-js wraps fetch exceptions like this
    expect(classifySupabaseFailure(undefined, { message: "TypeError: Failed to fetch", code: "" })).toBe("unreachable");
    expect(classifySupabaseFailure(null, { message: "NetworkError when attempting to fetch resource." })).toBe("unreachable");
    expect(classifySupabaseFailure(null, new Error("Load failed"))).toBe("unreachable");
    expect(classifySupabaseFailure(null, "connect ECONNREFUSED 127.0.0.1:54321")).toBe("unreachable");
    expect(classifySupabaseFailure(null, "getaddrinfo ENOTFOUND placeholder.supabase.co")).toBe("unreachable");
    expect(classifySupabaseFailure(null, { message: "network down" })).toBe("unreachable");
  });

  it("treats ordinary exceptions without a status as application errors (null)", () => {
    expect(classifySupabaseFailure(undefined, new Error("row-level security"))).toBeNull();
    expect(classifySupabaseFailure(undefined, { message: "validation failed", code: "23514" })).toBeNull();
    expect(classifySupabaseFailure(undefined, undefined)).toBeNull();
    expect(classifySupabaseFailure(null, null)).toBeNull();
    expect(classifySupabaseFailure(undefined, 42)).toBeNull();
  });

  it("lets a known 4xx status win over a TypeError-like error", () => {
    // status が数値ならそちらが優先され、isNetworkFailure は見ない
    expect(classifySupabaseFailure(404, new TypeError("Failed to fetch"))).toBeNull();
  });
});

describe("outageMessage / readOnlyError", () => {
  it("returns distinct Japanese messages per outage kind", () => {
    expect(outageMessage("paused")).toContain("一時停止");
    expect(outageMessage("unreachable")).toContain("接続できません");
    expect(outageMessage("paused")).not.toBe(outageMessage("unreachable"));
  });

  it("readOnlyError produces an Error whose message depends on the kind", () => {
    expect(readOnlyError("paused")).toBeInstanceOf(Error);
    expect(readOnlyError("paused").message).toContain("一時停止");
    expect(readOnlyError("unreachable").message).toContain("接続できない");
    expect(readOnlyError(null).message).toBe(readOnlyError("unreachable").message);
  });
});

describe("outage state without a window (SSR / node)", () => {
  it("getOutage returns null and set/clear/report do not throw", () => {
    expect(typeof window).toBe("undefined");
    expect(getOutage()).toBeNull();
    expect(() => setOutage("paused")).not.toThrow();
    expect(getOutage()).toBeNull();
    expect(() => clearOutage()).not.toThrow();
    expect(reportSupabaseFailure(540, null)).toBe("paused");
    expect(reportSupabaseFailure(401, null)).toBeNull();
  });
});

describe("outage state with a minimal window / sessionStorage stub", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubBrowser() {
    const store = new Map<string, string>();
    const sessionStorageStub = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
    };
    const dispatchEvent = vi.fn<(e: Event) => boolean>(() => true);
    const windowStub = { dispatchEvent, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal("window", windowStub);
    vi.stubGlobal("sessionStorage", sessionStorageStub);
    return { dispatchEvent, store };
  }

  it("setOutage persists the kind and dispatches the outage event", () => {
    const { dispatchEvent, store } = stubBrowser();
    expect(getOutage()).toBeNull();

    setOutage("paused");
    expect(getOutage()).toBe("paused");
    expect(store.get("fuel_lens_supabase_outage")).toBe("paused");
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    const evt = dispatchEvent.mock.calls[0][0] as CustomEvent;
    expect(evt.type).toBe(SUPABASE_OUTAGE_EVENT);
    expect(evt.detail).toBe("paused");
  });

  it("clearOutage removes the state and dispatches null only when there was an outage", () => {
    const { dispatchEvent } = stubBrowser();

    clearOutage(); // nothing stored → no event
    expect(dispatchEvent).not.toHaveBeenCalled();

    setOutage("unreachable");
    clearOutage();
    expect(getOutage()).toBeNull();
    expect(dispatchEvent).toHaveBeenCalledTimes(2);
    expect((dispatchEvent.mock.calls[1][0] as CustomEvent).detail).toBeNull();
  });

  it("reportSupabaseFailure records only real outages", () => {
    const { dispatchEvent } = stubBrowser();
    expect(reportSupabaseFailure(403, { message: "rls" })).toBeNull();
    expect(getOutage()).toBeNull();
    expect(dispatchEvent).not.toHaveBeenCalled();

    expect(reportSupabaseFailure(0, null)).toBe("unreachable");
    expect(getOutage()).toBe("unreachable");
  });

  it("getOutage ignores garbage stored values", () => {
    const { store } = stubBrowser();
    store.set("fuel_lens_supabase_outage", "something-else");
    expect(getOutage()).toBeNull();
  });
});
