/**
 * CSV 取り込みで共有する解析プリミティブ（Fuelio / FuelLens CSV の両方で使う）。純粋関数。React・保存先には依存しない。
 */

import { isValidCalendarDate } from "../dates";

const MAX_NUMBER = 1e9;

/**
 * RFC 4180 の CSV を行・列に分ける。ダブルクォートで囲んだ値（中のカンマ・改行・`""`）、CRLF / LF / CR に対応。
 * 先頭の UTF-8 BOM は除く。空行は `[""]` として返す（呼び出し側で読み飛ばす）。
 */
export function parseCsvRows(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else {
        field += c;
      }
      i += 1;
      continue;
    }
    if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r" || c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      if (c === "\r" && src[i + 1] === "\n") i += 1;
    } else {
      field += c;
    }
    i += 1;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** 空行（すべての列が空白のみ）か */
export function isBlankRow(row: readonly string[]): boolean {
  return row.every(v => v.trim() === "");
}

/** FNV-1a（32bit）の 16 進 8 桁。決定的な ID を作るためのもの（暗号用途ではない） */
export function hashString(value: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * 数値文字列を 0〜1e9 の有限数にする。空・不正は null。
 * - 桁区切りのカンマ（`5,000` `1,234` `12,345.6`）は取り除く
 * - 小数点のカンマ（`12,5`）は、カンマが 1 つで小数部が 3 桁でないときだけ受け付ける
 */
export function parseCsvNumber(raw: string | undefined): number | null {
  if (raw == null) return null;
  let s = raw.trim();
  if (s === "") return null;
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  else if (/^-?\d+,(\d{1,2}|\d{4,})$/.test(s)) s = s.replace(",", ".");
  if (!/^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n <= MAX_NUMBER ? n : null;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function ymd(y: number, m: number, d: number): string | null {
  const s = `${String(y).padStart(4, "0")}-${pad2(m)}-${pad2(d)}`;
  return isValidCalendarDate(s) ? s : null;
}

export type ParsedDate = {
  /** YYYY-MM-DD */
  date: string;
  /** 並べ替え用（YYYY-MM-DD HH:mm:ss。時刻が無ければ 00:00:00） */
  sortKey: string;
};

/**
 * 日付（時刻付きも可）を YYYY-MM-DD にする。読めなければ null。
 * - `yyyy-MM-dd` / `yyyy/MM/dd` / `yyyy.MM.dd`（後ろに ` HH:mm[:ss]` が付いてもよい）
 * - `dd.MM.yyyy`
 * - `MM/dd/yyyy`（formatHint に `dd/MM` を含むときは `dd/MM/yyyy`。片方が 12 を超えればそれで判断）
 * - `dd-MM-yyyy`（formatHint に `MM-dd` を含むときは `MM-dd-yyyy`）
 */
export function parseFlexibleDate(raw: string | undefined, formatHint = ""): ParsedDate | null {
  if (raw == null) return null;
  const s = raw.trim();
  const timeOf = (rest: string | undefined): string => {
    const t = rest ? /^[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(rest) : null;
    return t ? `${pad2(Number(t[1]))}:${t[2]}:${t[3] ?? "00"}` : "00:00:00";
  };
  const build = (y: number, m: number, d: number, rest: string | undefined): ParsedDate | null => {
    const date = ymd(y, m, d);
    return date ? { date, sortKey: `${date} ${timeOf(rest)}` } : null;
  };
  const hint = formatHint.toLowerCase();

  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(.*)$/.exec(s);
  if (m) return build(Number(m[1]), Number(m[2]), Number(m[3]), m[4]);

  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(.*)$/.exec(s);
  if (m) return build(Number(m[3]), Number(m[2]), Number(m[1]), m[4]);

  m = /^(\d{1,2})([/-])(\d{1,2})\2(\d{4})(.*)$/.exec(s);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[3]);
    const y = Number(m[4]);
    // 既定: `/` は月/日（米国式）、`-` は日-月
    let dayFirst = m[2] === "/" ? hint.includes("dd/mm") : !hint.includes("mm-dd");
    if (a > 12 && b <= 12) dayFirst = true;
    else if (b > 12 && a <= 12) dayFirst = false;
    return dayFirst ? build(y, b, a, m[5]) : build(y, a, b, m[5]);
  }
  return null;
}
