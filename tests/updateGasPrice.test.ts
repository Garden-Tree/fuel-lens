import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { deflateRawSync } from "node:zlib";
import {
  excelSerialToIso,
  extractNationalPrices,
  extractPublishedDate,
  findDetailXlsx,
  formatSummary,
  parseCurrentPrice,
  parseSharedStrings,
  parseSheetRows,
  readFirstSheetRows,
  renderNationalGasPrice,
  unzip,
  validatePrice,
} from "../scripts/update-gas-price.mjs";

// 資源エネルギー庁の結果詳細版（xlsx）の 1 枚目のシートを小さくしたもの。
// 実物と同じく、油種の見出しは B 列（縦書きの 1 文字ずつ）か C 列、調査日は D 列、全国は O 列（整数）と P 列（小数第 1 位）。
const SHARED_STRINGS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="9" uniqueCount="9">
<si><t>石油製品小売市況調査</t><rPh sb="0" eb="2"><t>コウリ</t></rPh></si>
<si><t xml:space="preserve"> ハイオク</t></si>
<si><t>レギュラー</t></si>
<si><t>店 頭</t></si>
<si><t>軽</t></si>
<si><t>灯</t></si>
<si><r><t>全国</t></r><r><t>（円／ﾘｯﾄﾙ）</t></r></si>
<si><t>揮</t></si>
<si><t>&lt;注&gt; &amp; 参考</t></si>
</sst>`;

const cellS = (ref: string, i: number) => `<c r="${ref}" s="1" t="s"><v>${i}</v></c>`;
const cellN = (ref: string, v: number) => `<c r="${ref}" s="2"><v>${v}</v></c>`;
const row = (r: number, cells: string) => `<row r="${r}" spans="2:16">${cells}</row>`;
// 46314 = 2026-10-19、46321 = 2026-10-26、46323 = 2026-10-28
const priceRow = (r: number, date: number, rounded: number, national: number, label = "") =>
  row(r, `${label}${cellN(`D${r}`, date)}${cellN(`E${r}`, rounded + 1)}${cellN(`O${r}`, rounded)}${cellN(`P${r}`, national)}`);

const SHEET = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
${row(1, cellS("B1", 0))}
${row(2, cellN("B2", 46323))}
<row r="3" spans="2:16"/>
${row(8, cellS("O8", 6))}
${priceRow(10, 46314, 181, 181, cellS("C10", 1))}
${priceRow(11, 46321, 181, 180.98, cellS("B11", 7))}
${priceRow(12, 46314, 170, 170.2, cellS("C12", 2))}
${priceRow(13, 46321, 170, 170.09999999999999)}
${priceRow(14, 46314, 160, 159.69999999999999, cellS("C14", 3))}
${priceRow(15, 46321, 160, 159.69999999999999, cellS("B15", 4))}
${priceRow(16, 46314, 2573, 0, cellS("C16", 3))}
${row(17, `${cellS("B17", 5)}<c r="D17" t="str"><v>(  "  )</v></c>${cellN("O17", 142.9)}`)}
${priceRow(18, 46321, 2580, 0)}
${row(20, cellS("B20", 8))}
</sheetData></worksheet>`;

const WORKBOOK = `<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>
<sheet name="公表資料（経済産業局別）" sheetId="2" r:id="rId1"/><sheet name="公表資料（都道府県別）" sheetId="3" r:id="rId2"/>
</sheets></workbook>`;
const WORKBOOK_RELS = `<Relationships>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;

/** テスト用の最小の zip（CRC は読まないので 0 にする）。deflate と stored を混ぜる */
function buildZip(entries: Record<string, string>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  Object.entries(entries).forEach(([name, content], i) => {
    const raw = Buffer.from(content, "utf8");
    const method = i % 2 === 0 ? 8 : 0;
    const data = method === 8 ? deflateRawSync(raw) : raw;
    const nameBuf = Buffer.from(name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  });
  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(entries).length, 8);
  eocd.writeUInt16LE(Object.keys(entries).length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, eocd]);
}

const rows = () => parseSheetRows(SHEET, parseSharedStrings(SHARED_STRINGS));

const CURRENT = { regular: 170.1, highOctane: 181.0, diesel: 159.7, surveyDate: "2026-10-19", publishedDate: "2026-10-21" };
const NEXT = { regular: 170.1, highOctane: 181.0, diesel: 159.7, surveyDate: "2026-10-26", publishedDate: "2026-10-28" };

describe("findDetailXlsx", () => {
  it("結果詳細版の xlsx を絶対 URL にし、ファイル名から公表日を読む。週次ファイルや灯油の xlsx は選ばない", () => {
    const html = `
      <a href="/statistics/petroleum_and_lpgas/pl007/docx/261028.docx">結果概要版</a>
      <a href="/statistics/petroleum_and_lpgas/pl007/xlsx/261028s5.xlsx">週次ファイル</a>
      <a href="/statistics/petroleum_and_lpgas/pl007/xlsx/261028.xlsx">10月28日（水）結果詳細版（EXCEL形式）</a>
      <a href="/statistics/petroleum_and_lpgas/pl007/xlsx/261030t.xlsx">灯油</a>`;
    expect(findDetailXlsx(html)).toEqual({
      url: "https://www.enecho.meti.go.jp/statistics/petroleum_and_lpgas/pl007/xlsx/261028.xlsx",
      publishedDate: "2026-10-28",
    });
  });

  it("リンクが無ければ失敗する", () => {
    expect(() => findDetailXlsx('<a href="/statistics/petroleum_and_lpgas/pl007/xlsx/261028s5.xlsx">x</a>')).toThrow();
  });
});

describe("xlsx の解析", () => {
  it("共有文字列はリッチテキストを連結し、ふりがなと XML の実体参照を処理する", () => {
    const s = parseSharedStrings(SHARED_STRINGS);
    expect(s[0]).toBe("石油製品小売市況調査");
    expect(s[1]).toBe(" ハイオク");
    expect(s[6]).toBe("全国（円／ﾘｯﾄﾙ）");
    expect(s[8]).toBe("<注> & 参考");
  });

  it("セルは数値と文字列に分け、空の行も行番号を持つ", () => {
    const r = rows();
    expect(r.find((x) => x.row === 2)!.cells.B).toBe(46323);
    expect(r.find((x) => x.row === 3)!.cells).toEqual({});
    expect(r.find((x) => x.row === 10)!.cells).toMatchObject({ C: " ハイオク", D: 46314, P: 181 });
    expect(r.find((x) => x.row === 17)!.cells.D).toBe('(  "  )');
  });

  it("Excel の日付シリアル値を YYYY-MM-DD にする", () => {
    expect(excelSerialToIso(46321)).toBe("2026-10-26");
    expect(excelSerialToIso(46323)).toBe("2026-10-28");
    expect(excelSerialToIso(46023)).toBe("2026-01-01");
  });

  it("油種ごとのブロックの最後の行（最新の調査日）の全国の値を小数第 1 位で読む。灯油は読まない", () => {
    expect(extractNationalPrices(rows())).toEqual({ regular: 170.1, highOctane: 181.0, diesel: 159.7, surveyDate: "2026-10-26" });
    expect(extractPublishedDate(rows())).toBe("2026-10-28");
  });

  it("油種がそろわない・調査日がそろわない・O 列と P 列が食い違うときは失敗する", () => {
    const withoutDiesel = rows().filter((r) => r.row !== 14 && r.row !== 15);
    expect(() => extractNationalPrices(withoutDiesel)).toThrow(/diesel/);

    const r = rows();
    r.find((x) => x.row === 13)!.cells.D = 46320;
    expect(() => extractNationalPrices(r)).toThrow(/調査日/);

    const shifted = rows();
    shifted.find((x) => x.row === 11)!.cells.P = 18.1;
    expect(() => extractNationalPrices(shifted)).toThrow(/食い違/);

    const missing = rows();
    delete missing.find((x) => x.row === 13)!.cells.P;
    expect(() => extractNationalPrices(missing)).toThrow(/数値ではありません/);
  });

  it("zip を展開し、workbook.xml の最初のシートを rels で解決して読む", () => {
    const zip = buildZip({
      "[Content_Types].xml": "<Types/>",
      "xl/workbook.xml": WORKBOOK,
      "xl/_rels/workbook.xml.rels": WORKBOOK_RELS,
      "xl/worksheets/sheet2.xml": "<worksheet><sheetData/></worksheet>",
      "xl/worksheets/sheet1.xml": SHEET,
      "xl/sharedStrings.xml": SHARED_STRINGS,
    });
    const files = unzip(zip);
    expect(files.get("xl/worksheets/sheet1.xml")!.toString("utf8")).toBe(SHEET);
    expect(extractNationalPrices(readFirstSheetRows(files))).toMatchObject({ regular: 170.1, surveyDate: "2026-10-26" });
  });

  it("zip でなければ失敗する", () => {
    expect(() => unzip(Buffer.from("<!DOCTYPE html><html></html>"))).toThrow(/zip/);
  });
});

describe("妥当性のチェック", () => {
  const today = "2026-10-29";

  it("範囲内で調査日が新しければ問題なし。同じ調査日もエラーではない（更新なし）", () => {
    expect(validatePrice(NEXT, CURRENT, today)).toEqual([]);
    expect(validatePrice({ ...NEXT, surveyDate: CURRENT.surveyDate, publishedDate: CURRENT.publishedDate }, CURRENT, today)).toEqual([]);
  });

  it("100〜300 円/L の範囲外・欠けた値はエラー", () => {
    expect(validatePrice({ ...NEXT, regular: 99.9 }, CURRENT, today)).toHaveLength(1);
    expect(validatePrice({ ...NEXT, highOctane: 300.1 }, CURRENT, today)).toHaveLength(1);
    expect(validatePrice({ ...NEXT, diesel: Number.NaN }, CURRENT, today)).toHaveLength(1);
    expect(validatePrice({ ...NEXT, diesel: undefined }, CURRENT, today)).toHaveLength(1);
    expect(validatePrice({ ...NEXT, regular: 100, highOctane: 300 }, CURRENT, today)).toEqual([]);
  });

  it("調査日が現在より古い・公表日が調査日より前・未来の日付はエラー", () => {
    expect(validatePrice({ ...NEXT, surveyDate: "2026-10-12" }, CURRENT, today)[0]).toMatch(/古い/);
    expect(validatePrice({ ...NEXT, publishedDate: "2026-10-25" }, CURRENT, today)[0]).toMatch(/前/);
    expect(validatePrice(NEXT, CURRENT, "2026-10-26")[0]).toMatch(/未来/);
    expect(validatePrice(NEXT, CURRENT, "2026-10-27")).toEqual([]);
    expect(validatePrice({ ...NEXT, surveyDate: "2026/10/26" }, CURRENT, today)[0]).toMatch(/形式/);
  });
});

describe("lib/nationalGasPrice.ts の読み書き", () => {
  const source = readFileSync(new URL("../lib/nationalGasPrice.ts", import.meta.url), "utf8");

  it("現在の値を読める", () => {
    const current = parseCurrentPrice(source);
    expect(Object.keys(current)).toEqual(["regular", "highOctane", "diesel", "surveyDate", "publishedDate"]);
    expect(current.surveyDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(current.regular).toBeGreaterThan(0);
  });

  it("5 つの値だけを書き換え、単価は小数第 1 位まで（181 でも 181.0）。出典などは変えない", () => {
    const next = { regular: 165, highOctane: 176.25, diesel: 154.2, surveyDate: "2027-01-05", publishedDate: "2027-01-07" };
    const out = renderNationalGasPrice(source, next);
    expect(parseCurrentPrice(out)).toEqual({ ...next, regular: 165.0, highOctane: 176.3 });
    expect(out).toContain("regular: 165.0,");
    expect(out).toContain("highOctane: 176.3,");
    const strip = (s: string) => s.replace(/\b(regular|highOctane|diesel|surveyDate|publishedDate): [^,]+,/g, "");
    expect(strip(out)).toBe(strip(source));
    expect(renderNationalGasPrice(out, parseCurrentPrice(source))).toBe(source);
  });

  it("書き換える場所が見つからなければ失敗する", () => {
    expect(() => renderNationalGasPrice(source.replace("diesel:", "keiyu:"), NEXT)).toThrow(/diesel/);
  });

  it("差分の表は現在と取得した値を並べる", () => {
    const table = formatSummary(CURRENT, { ...NEXT, regular: 168.6 });
    expect(table).toContain("| レギュラー（円/L） | 170.1 | 168.6 (-1.5) |");
    expect(table).toContain("| ハイオク（円/L） | 181.0 | 181.0 (+0.0) |");
    expect(table).toContain("| 調査日 | 2026-10-19 | 2026-10-26 |");
  });
});
