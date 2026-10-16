import { describe, expect, it } from "vitest";
import {
  MAX_BATCH_IMAGES,
  MAX_RETRY_AFTER_MS,
  batchPositionLabel,
  batchSummaryMessage,
  createRequestPacer,
  emptyAnalyzeResult,
  findPossibleDuplicate,
  overLimitMessage,
  parseRetryAfterMs,
  rateLimitWaitMessage,
  selectBatchImages,
  waitSeconds,
} from "@/lib/scan/batch";
import { abortConfirmMessage } from "@/lib/scan/useBatchScan";
import type { BatchState } from "@/lib/scan/batchController";
import type { FuelRecord } from "@/lib/types";

const img = (name: string) => new File(["x"], name, { type: "image/jpeg" });
const txt = (name: string) => new File(["x"], name, { type: "text/plain" });

describe("selectBatchImages", () => {
  it("画像だけを選択順に残し、上限で切り詰めて除いた数を返す", () => {
    const files = [img("a.jpg"), txt("memo.txt"), ...Array.from({ length: 22 }, (_, i) => img(`p${i}.jpg`))];
    const { images, nonImages, overLimit } = selectBatchImages(files);
    expect(images).toHaveLength(MAX_BATCH_IMAGES);
    expect(images[0].name).toBe("a.jpg");
    expect(images[1].name).toBe("p0.jpg");
    expect(nonImages).toBe(1);
    expect(overLimit).toBe(3);
  });

  it("上限以内ならすべて残す", () => {
    expect(selectBatchImages([img("a.jpg"), img("b.jpg")])).toMatchObject({ nonImages: 0, overLimit: 0 });
    expect(selectBatchImages([img("a.jpg"), img("b.jpg"), img("c.jpg")], 2).overLimit).toBe(1);
  });

  it("上限超過の案内は日本語で枚数を添える", () => {
    expect(overLimitMessage(3)).toContain("20 枚まで");
    expect(overLimitMessage(3)).toContain("残りの 3 枚");
  });
});

describe("parseRetryAfterMs", () => {
  const now = Date.parse("2026-10-15T09:00:00Z");
  it("秒数はミリ秒に、HTTP 日付は今からの差に、読めなければ既定の 30 秒にする", () => {
    expect(parseRetryAfterMs("12", now)).toBe(12_000);
    expect(parseRetryAfterMs("Thu, 15 Oct 2026 09:00:20 GMT", now)).toBe(20_000);
    expect(parseRetryAfterMs(null, now)).toBe(30_000);
    expect(parseRetryAfterMs("abc", now)).toBe(30_000);
  });
  it("1 秒以上・上限以下に収める", () => {
    expect(parseRetryAfterMs("0", now)).toBe(1000);
    expect(parseRetryAfterMs("Thu, 15 Oct 2026 08:00:00 GMT", now)).toBe(1000);
    expect(parseRetryAfterMs("100000", now)).toBe(MAX_RETRY_AFTER_MS);
  });
});

describe("createRequestPacer", () => {
  it("窓の中で max 回送ったら、最も古い送信が窓から出るまで待たせる", () => {
    const pacer = createRequestPacer(3, 10_000);
    expect(pacer.delayMs(0)).toBe(0);
    pacer.record(0);
    pacer.record(1000);
    pacer.record(2000);
    expect(pacer.delayMs(2000)).toBe(8000);
    expect(pacer.delayMs(9999)).toBe(1);
    expect(pacer.delayMs(10_000)).toBe(0);
    pacer.record(10_000);
    // 窓の中は 1000・2000・10000 の 3 回 → 1000 が出る 11000 まで待つ
    expect(pacer.delayMs(10_500)).toBe(500);
  });

  it("blockUntil（429 の Retry-After）までは送らせない", () => {
    const pacer = createRequestPacer(5, 60_000);
    pacer.blockUntil(5000);
    expect(pacer.delayMs(1000)).toBe(4000);
    pacer.blockUntil(3000); // 短くはしない
    expect(pacer.delayMs(1000)).toBe(4000);
    expect(pacer.delayMs(5000)).toBe(0);
  });
});

describe("表示の文言", () => {
  it("進み具合・待ち時間", () => {
    expect(batchPositionLabel(2, 12)).toBe("3 / 12 枚目");
    expect(waitSeconds(2001)).toBe(3);
    expect(waitSeconds(0)).toBe(1);
    expect(rateLimitWaitMessage(12)).toBe("読み取りの回数制限のため、あと 12 秒待っています");
  });

  it("終わったときの結果", () => {
    expect(batchSummaryMessage({ total: 12, saved: 9, skipped: 3 })).toBe("12 枚中 9 件を保存、3 件をスキップしました");
    expect(batchSummaryMessage({ total: 3, saved: 3, skipped: 0 })).toBe("3 枚中 3 件を保存しました");
    expect(batchSummaryMessage({ total: 12, saved: 3, skipped: 1, cancelled: 8 })).toBe(
      "12 枚中 3 件を保存、1 件をスキップし、残りの 8 枚は中止しました"
    );
    expect(batchSummaryMessage({ total: 5, saved: 0, skipped: 0, cancelled: 5 })).toBe("5 枚中 0 件を保存し、残りの 5 枚は中止しました");
  });

  it("中止の確認文は残りの枚数を添える", () => {
    const state = {
      items: Array.from({ length: 5 }, (_, index) => ({ index })),
      current: 2,
      phase: "running",
    } as unknown as BatchState;
    expect(abortConfirmMessage(state)).toBe("残りの 3 枚の読み取りを中止しますか？表示中の読み取り結果は保存されません。");
  });

  it("読み取れなかった写真の空の結果は、日付を含めてすべて null", () => {
    const r = emptyAnalyzeResult();
    expect(r.date).toBeNull();
    expect(r.total_cost).toBeNull();
    expect(r.total_distance).toBeNull();
  });
});

describe("findPossibleDuplicate", () => {
  const rec = (over: Partial<FuelRecord>): FuelRecord => ({
    id: "r",
    date: "2025-03-01",
    total_distance: null,
    fuel_amount: 30,
    total_cost: 4800,
    price_per_unit: 160,
    fuel_efficiency: null,
    gas_station: null,
    vehicle_id: "v1",
    ...over,
  });

  it("同じ日付・支払総額なら重複の可能性あり（給油量は両方にあるときだけ比べる）", () => {
    const records = [rec({ id: "a" })];
    expect(findPossibleDuplicate(records, { date: "2025-03-01", total_cost: 4800, fuel_amount: 30 })?.id).toBe("a");
    expect(findPossibleDuplicate(records, { date: "2025-03-01", total_cost: 4800, fuel_amount: null })?.id).toBe("a");
    expect(findPossibleDuplicate([rec({ fuel_amount: null })], { date: "2025-03-01", total_cost: 4800, fuel_amount: 30 })).not.toBeNull();
    expect(findPossibleDuplicate(records, { date: "2025-03-01", total_cost: 4800, fuel_amount: 25 })).toBeNull();
  });

  it("日付か金額が違えば重複ではない", () => {
    const records = [rec({})];
    expect(findPossibleDuplicate(records, { date: "2025-03-02", total_cost: 4800, fuel_amount: 30 })).toBeNull();
    expect(findPossibleDuplicate(records, { date: "2025-03-01", total_cost: 4801, fuel_amount: 30 })).toBeNull();
  });

  it("支払総額が無ければ給油量で比べ、日付が無い・金額も給油量も無いときは判定しない", () => {
    const records = [rec({})];
    expect(findPossibleDuplicate(records, { date: "2025-03-01", total_cost: null, fuel_amount: 30 })).not.toBeNull();
    expect(findPossibleDuplicate([rec({ fuel_amount: null })], { date: "2025-03-01", total_cost: null, fuel_amount: 30 })).toBeNull();
    expect(findPossibleDuplicate(records, { date: "", total_cost: 4800, fuel_amount: 30 })).toBeNull();
    expect(findPossibleDuplicate(records, { date: "2025-03-01", total_cost: null, fuel_amount: null })).toBeNull();
  });
});
