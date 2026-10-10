import { describe, expect, it } from "vitest";
import {
  availableYears,
  dayParts,
  filterByYearMonth,
  formatDistance,
  formatEfficiency,
  formatLiters,
  formatYen,
  recordElementId,
  recordIdFromHash,
  sortRecords,
} from "@/lib/history/recordList";

type R = { id: string; date: string; created_at?: string | null };

const ids = (rs: readonly R[]) => rs.map(r => r.id);

describe("availableYears / filterByYearMonth", () => {
  const records: R[] = [
    { id: "a", date: "2026-09-11" },
    { id: "b", date: "2025-09-01" },
    { id: "c", date: "2026-01-20" },
    { id: "d", date: "" },
  ];

  it("記録のある年を新しい順に返す", () => {
    expect(availableYears(records)).toEqual(["2026", "2025"]);
  });

  it("all / all なら絞り込まない（日付なしも残す）", () => {
    expect(filterByYearMonth(records, "all", "all")).toBe(records);
  });

  it("年・月で絞り込み、日付の無い記録は除く", () => {
    expect(ids(filterByYearMonth(records, "2026", "all"))).toEqual(["a", "c"]);
    expect(ids(filterByYearMonth(records, "all", "9"))).toEqual(["a", "b"]);
    expect(ids(filterByYearMonth(records, "2026", "1"))).toEqual(["c"]);
  });
});

describe("sortRecords", () => {
  const records: R[] = [
    { id: "1", date: "2026-01-01", created_at: "2026-03-01T00:00:00Z" },
    { id: "2", date: "", created_at: "2026-04-01T00:00:00Z" },
    { id: "3", date: "2026-02-01", created_at: "2026-01-01T00:00:00Z" },
    { id: "4", date: "2026-02-01", created_at: "2026-02-01T00:00:00Z" },
    { id: "5", date: "2026-01-01", created_at: null },
  ];

  it("給油日の新しい順。同日は登録の新しい順、日付なしは末尾", () => {
    expect(ids(sortRecords(records, "date"))).toEqual(["4", "3", "1", "5", "2"]);
  });

  it("登録の新しい順。created_at が無ければ最も古い扱い（id の降順）", () => {
    expect(ids(sortRecords(records, "created_at"))).toEqual(["2", "1", "4", "3", "5"]);
  });

  it("元の配列を変えない", () => {
    const copy = [...records];
    sortRecords(records, "date");
    expect(records).toEqual(copy);
  });
});

describe("表示用の書式", () => {
  it("dayParts は日 2 桁と曜日を返す（不正なら null）", () => {
    expect(dayParts("2026-09-11")).toEqual({ day: "11", weekday: "金", month: 9, year: 2026 });
    expect(dayParts("2026-06-03")?.day).toBe("03");
    expect(dayParts("2026-02-30")).toBeNull();
    expect(dayParts(null)).toBeNull();
  });

  it("数値の書式（無ければ null）", () => {
    expect(formatLiters(29.1)).toBe("29.10");
    expect(formatLiters(null)).toBeNull();
    expect(formatEfficiency(15.123)).toBe("15.12");
    expect(formatEfficiency(0)).toBeNull();
    expect(formatEfficiency(null)).toBeNull();
    expect(formatYen(10091)).toBe("¥10,091");
    expect(formatYen(undefined)).toBeNull();
    expect(formatDistance(1440.25)).toBe("1,440.3");
    expect(formatDistance(351)).toBe("351.0");
    expect(formatDistance(null)).toBeNull();
  });

  it("#record-<id> のハッシュから ID を取り出す", () => {
    expect(recordIdFromHash("#record-abc-123")).toBe("abc-123");
    expect(recordIdFromHash(`#${recordElementId("x y")}`)).toBe("x y");
    expect(recordIdFromHash("#record-%E3%81%82")).toBe("あ");
    expect(recordIdFromHash("#other")).toBeNull();
    expect(recordIdFromHash("")).toBeNull();
  });
});
