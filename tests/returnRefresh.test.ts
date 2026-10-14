import { describe, expect, it } from "vitest";
import {
  RETURN_REFRESH_MIN_HIDDEN_MS,
  RETURN_REFRESH_MIN_INTERVAL_MS,
  shouldRefreshOnReturn,
} from "@/lib/useReturnRefresh";

const NOW = 1_000_000;

describe("shouldRefreshOnReturn", () => {
  it("既定値は 10 秒離れたら・30 秒に 1 回まで", () => {
    expect(RETURN_REFRESH_MIN_HIDDEN_MS).toBe(10_000);
    expect(RETURN_REFRESH_MIN_INTERVAL_MS).toBe(30_000);
  });

  it("10 秒以上離れていて、まだ再取得していなければ再取得する", () => {
    expect(shouldRefreshOnReturn({ hiddenAt: NOW - 10_000, now: NOW, lastRefreshAt: null })).toBe(true);
  });

  it("離れていない（hiddenAt が null）なら再取得しない", () => {
    expect(shouldRefreshOnReturn({ hiddenAt: null, now: NOW, lastRefreshAt: null })).toBe(false);
  });

  it("短いタブ切り替え（10 秒未満）では再取得しない", () => {
    expect(shouldRefreshOnReturn({ hiddenAt: NOW - 9_999, now: NOW, lastRefreshAt: null })).toBe(false);
  });

  it("前回の再取得から 30 秒未満なら再取得しない", () => {
    expect(shouldRefreshOnReturn({ hiddenAt: NOW - 20_000, now: NOW, lastRefreshAt: NOW - 29_999 })).toBe(false);
    expect(shouldRefreshOnReturn({ hiddenAt: NOW - 20_000, now: NOW, lastRefreshAt: NOW - 30_000 })).toBe(true);
  });

  it("オフラインなら再取得しない", () => {
    expect(shouldRefreshOnReturn({ hiddenAt: NOW - 60_000, now: NOW, lastRefreshAt: null, online: false })).toBe(false);
  });

  it("しきい値を変えられる", () => {
    const base = { hiddenAt: NOW - 3_000, now: NOW, lastRefreshAt: NOW - 5_000 };
    expect(shouldRefreshOnReturn(base)).toBe(false);
    expect(shouldRefreshOnReturn({ ...base, minHiddenMs: 2_000, minIntervalMs: 5_000 })).toBe(true);
  });
});
