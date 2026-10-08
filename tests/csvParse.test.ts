import { describe, expect, it } from "vitest";

import { hashString, isBlankRow, parseCsvNumber, parseCsvRows, parseFlexibleDate } from "@/lib/importers/csvParse";
import * as fuelio from "@/lib/importers/fuelio";

describe("parseCsvRows", () => {
  it("クォート内のカンマ・改行・エスケープした引用符と CRLF を扱う", () => {
    const rows = parseCsvRows('﻿a,"b,c","d ""e""",\r\n"x\ny",2\r\n');
    expect(rows).toEqual([
      ["a", "b,c", 'd "e"', ""],
      ["x\ny", "2"],
    ]);
  });

  it("最終行に改行が無くても読める", () => {
    expect(parseCsvRows("1,2\n3,4")).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
  });
});

describe("parseCsvNumber", () => {
  it("桁区切りのカンマは取り除く", () => {
    expect(parseCsvNumber("5,000")).toBe(5000);
    expect(parseCsvNumber("1,234")).toBe(1234);
    expect(parseCsvNumber("12,345.6")).toBe(12345.6);
    expect(parseCsvNumber("141,789")).toBe(141789);
    expect(parseCsvNumber("1,234,567")).toBe(1234567);
  });

  it("カンマが 1 つで小数部が 3 桁でなければ小数点として読む", () => {
    expect(parseCsvNumber("5,5")).toBe(5.5);
    expect(parseCsvNumber("12,34")).toBe(12.34);
    expect(parseCsvNumber("12,3456")).toBe(12.3456);
  });

  it("空・不正・負数は null", () => {
    expect(parseCsvNumber("")).toBeNull();
    expect(parseCsvNumber(undefined)).toBeNull();
    expect(parseCsvNumber("abc")).toBeNull();
    expect(parseCsvNumber("1,2,3")).toBeNull();
    expect(parseCsvNumber("-5")).toBeNull();
  });
});

describe("parseFlexibleDate", () => {
  it("yyyy-MM-dd（時刻付きも）を読む", () => {
    expect(parseFlexibleDate("2024-12-01")?.date).toBe("2024-12-01");
    expect(parseFlexibleDate("2024-12-01 08:05")).toEqual({ date: "2024-12-01", sortKey: "2024-12-01 08:05:00" });
    expect(parseFlexibleDate("2024/3/9")?.date).toBe("2024-03-09");
  });

  it("dd.MM.yyyy と MM/dd/yyyy・dd/MM/yyyy を読む", () => {
    expect(parseFlexibleDate("01.12.2024")?.date).toBe("2024-12-01");
    expect(parseFlexibleDate("12/01/2024")?.date).toBe("2024-12-01");
    expect(parseFlexibleDate("12/01/2024", "dd/MM/yyyy")?.date).toBe("2024-01-12");
    // 片方が 12 を超えればヒントより優先
    expect(parseFlexibleDate("25/12/2024")?.date).toBe("2024-12-25");
  });

  it("存在しない日付や形式外は null", () => {
    expect(parseFlexibleDate("2024-02-30")).toBeNull();
    expect(parseFlexibleDate("yesterday")).toBeNull();
    expect(parseFlexibleDate("")).toBeNull();
  });
});

describe("isBlankRow", () => {
  it("すべての列が空白なら true", () => {
    expect(isBlankRow([""])).toBe(true);
    expect(isBlankRow([" ", "	"])).toBe(true);
    expect(isBlankRow(["", "x"])).toBe(false);
  });
});

describe("hashString", () => {
  it("決定的な 16 進 8 桁を返す", () => {
    expect(hashString("abc")).toBe(hashString("abc"));
    expect(hashString("abc")).toMatch(/^[0-9a-f]{8}$/);
    expect(hashString("abc")).not.toBe(hashString("abd"));
    expect(hashString("")).toBe("811c9dc5");
  });
});

describe("fuelio.ts の互換再エクスポート", () => {
  it("csvParse.ts と同じ関数を返す", () => {
    expect(fuelio.parseCsvRows).toBe(parseCsvRows);
    expect(fuelio.parseCsvNumber).toBe(parseCsvNumber);
    expect(fuelio.parseFlexibleDate).toBe(parseFlexibleDate);
    expect(fuelio.hashString).toBe(hashString);
    expect(fuelio.isBlankRow).toBe(isBlankRow);
  });
});
