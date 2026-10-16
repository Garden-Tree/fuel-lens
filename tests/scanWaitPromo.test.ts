import { describe, expect, it } from "vitest";
import {
  SCAN_WAIT_PROMO_DELAY_MS,
  SCAN_WAIT_PROMO_INTERVAL_MS,
  decideScanWaitPromo,
  type ScanWaitPromoInput,
} from "@/lib/promo/scanWait";

const base: ScanWaitPromoInput = {
  loadingStep: "analyze",
  elapsedMs: SCAN_WAIT_PROMO_DELAY_MS,
  vehicleType: "bike",
  batchActive: false,
  lastShownAt: null,
  now: 1_000_000_000_000,
};

describe("decideScanWaitPromo", () => {
  it("バイクで解析中、待ち時間を過ぎていれば出す", () => {
    expect(decideScanWaitPromo(base)?.id).toBe("insweb-bike");
  });
  it("車・車両なしでは出さない", () => {
    expect(decideScanWaitPromo({ ...base, vehicleType: "car" })).toBeNull();
    expect(decideScanWaitPromo({ ...base, vehicleType: null })).toBeNull();
  });
  it("圧縮中・スキャンなしでは出さない", () => {
    expect(decideScanWaitPromo({ ...base, loadingStep: "compress" })).toBeNull();
    expect(decideScanWaitPromo({ ...base, loadingStep: null })).toBeNull();
  });
  it("待ち時間の前は出さない", () => {
    expect(decideScanWaitPromo({ ...base, elapsedMs: SCAN_WAIT_PROMO_DELAY_MS - 1 })).toBeNull();
  });
  it("一括読み取り中は出さない", () => {
    expect(decideScanWaitPromo({ ...base, batchActive: true })).toBeNull();
  });
  it("7 日以内に出していたら出さず、7 日たてば出す", () => {
    expect(decideScanWaitPromo({ ...base, lastShownAt: base.now - SCAN_WAIT_PROMO_INTERVAL_MS + 1 })).toBeNull();
    expect(decideScanWaitPromo({ ...base, lastShownAt: base.now - SCAN_WAIT_PROMO_INTERVAL_MS })).not.toBeNull();
  });
});
