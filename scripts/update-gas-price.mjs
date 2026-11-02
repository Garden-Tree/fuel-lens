// 全国平均のガソリン価格（資源エネルギー庁「石油製品価格調査」の週次調査）を取得し、lib/nationalGasPrice.ts を更新する。
// .github/workflows/update-gas-price.yml が毎週水曜・木曜の夕方に実行し、差分があれば PR を作る。手動なら:
//   node scripts/update-gas-price.mjs            # 新しい調査日の値があれば書き換える
//   node scripts/update-gas-price.mjs --dry-run  # 書き換えずに取得した値と差分を表示するだけ
// 取得・解析・妥当性チェックのどれかに失敗したら非 0 で終了し、ファイルは触らない。
// 依存を増やさないため、xlsx（zip）は Node 標準の zlib で展開し、シートの XML は正規表現で読む。

import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { fileURLToPath } from "node:url";

export const RESULTS_URL = "https://www.enecho.meti.go.jp/statistics/petroleum_and_lpgas/pl007/results.html";
export const TARGET_FILE = fileURLToPath(new URL("../lib/nationalGasPrice.ts", import.meta.url));
/** 取得元はブラウザ以外の User-Agent や Referer なしだと xlsx の代わりに HTML を返す */
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
/** 妥当とみなす単価の範囲（円/L、消費税込み） */
export const PRICE_RANGE = { min: 100, max: 300 };
/** 全国の列（「全国」の小数第 1 位の値。O 列は整数に丸めた値） */
const NATIONAL_COLUMN = "P";
const NATIONAL_ROUNDED_COLUMN = "O";
const DATE_COLUMN = "D";

/**
 * 調査結果ページから「結果詳細版（EXCEL形式）」の xlsx の URL と、ファイル名（YYMMDD.xlsx = 公表日）から公表日を取り出す。
 * 週次ファイル（…s5.xlsx）や灯油など他の調査（…t.xlsx など）は対象外。
 */
export function findDetailXlsx(html, baseUrl = RESULTS_URL) {
  const m = html.match(/href="([^"]*\/pl007\/xlsx\/(\d{2})(\d{2})(\d{2})\.xlsx)"/);
  if (!m) throw new Error("調査結果ページに結果詳細版の xlsx へのリンクが見つかりません");
  const [, href, yy, mm, dd] = m;
  return { url: new URL(href, baseUrl).toString(), publishedDate: `20${yy}-${mm}-${dd}` };
}

/** zip（xlsx）を展開し、名前 → 中身（Buffer）の Map を返す。stored と deflate だけに対応 */
export function unzip(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error("zip の終端レコードが見つかりません（xlsx ではない可能性があります）");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("zip の中央ディレクトリが壊れています");
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    p += 46 + nameLen + extraLen + commentLen;
    if (buf.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`zip のローカルヘッダが壊れています: ${name}`);
    const start = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
    const data = buf.subarray(start, start + compressedSize);
    if (method === 0) files.set(name, data);
    else if (method === 8) files.set(name, inflateRawSync(data));
    // 他の圧縮方式のエントリ（使わないもの）は読まない
  }
  return files;
}

function decodeXml(text) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

/** sharedStrings.xml の文字列の配列（リッチテキストの <r> は連結し、ふりがなの <rPh> は除く） */
export function parseSharedStrings(xml) {
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => {
    const body = m[1].replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
    return [...body.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((t) => decodeXml(t[1])).join("");
  });
}

/**
 * シートの XML を行の配列 [{ row, cells: { A: 値, … } }] にする。数値セルは number、文字列セルは string
 * @param {string} xml
 * @param {string[]} sharedStrings
 * @returns {{ row: number, cells: Record<string, string | number | boolean> }[]}
 */
export function parseSheetRows(xml, sharedStrings) {
  const rows = [];
  for (const r of xml.matchAll(/<row\b[^>]*\br="(\d+)"[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    /** @type {Record<string, string | number | boolean>} */
    const cells = {};
    for (const c of (r[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = c[1].match(/\br="([A-Z]+)\d+"/)?.[1];
      if (!ref) continue;
      const type = c[1].match(/\bt="(\w+)"/)?.[1];
      const inner = c[2] ?? "";
      if (type === "inlineStr") {
        cells[ref] = [...inner.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((t) => decodeXml(t[1])).join("");
        continue;
      }
      const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      if (v === undefined) continue;
      if (type === "s") cells[ref] = sharedStrings[Number(v)] ?? "";
      else if (type === "str" || type === "e") cells[ref] = decodeXml(v);
      else if (type === "b") cells[ref] = v === "1";
      else cells[ref] = Number(v);
    }
    rows.push({ row: Number(r[1]), cells });
  }
  return rows;
}

/** Excel の日付シリアル値（1900 年基準）を YYYY-MM-DD にする */
export function excelSerialToIso(serial) {
  const ms = Math.round((serial - 25569) * 86400000);
  return new Date(ms).toISOString().slice(0, 10);
}

/** 調査日として読む日付シリアル値の範囲（2000-01-01〜2099-12-31） */
const isDateSerial = (v) => typeof v === "number" && Number.isInteger(v) && v >= 36526 && v <= 73050;

/** B・C 列の見出し（縦書きの 1 文字ずつのものもある）から油種を判定する */
function gradeOf(label) {
  const text = label.replace(/\s/g, "");
  if (text.includes("ハイオク")) return "highOctane";
  if (text.includes("レギュラー")) return "regular";
  if (text.includes("軽")) return "diesel";
  if (text.includes("灯")) return "kerosene";
  return null;
}

const round1 = (v) => Math.round(v * 10) / 10;

/**
 * 結果詳細版の 1 枚目のシート（経済産業局別）から、全国のレギュラー・ハイオク・軽油の最新の調査日の値を読む。
 * 油種ごとに調査日（D 列）が古い順に並んだブロックになっていて、各ブロックの最後の行が最新。
 * 調査日が前の行より新しくない行で次のブロックに切り替わる。油種は B・C 列の見出しで判定する。
 */
export function extractNationalPrices(rows) {
  const blocks = [];
  let current = null;
  for (const { cells } of rows) {
    const label = ["B", "C"].map((col) => (typeof cells[col] === "string" ? cells[col] : "")).join("");
    const date = cells[DATE_COLUMN];
    if (isDateSerial(date)) {
      if (!current || date <= current.lastDate) {
        current = { labels: "", rows: [], lastDate: date };
        blocks.push(current);
      }
      current.lastDate = date;
      current.rows.push(cells);
    }
    if (current) current.labels += label;
  }
  const found = {};
  for (const block of blocks) {
    const grade = gradeOf(block.labels);
    if (!grade || grade === "kerosene") continue;
    if (found[grade]) throw new Error(`油種「${grade}」のブロックが複数あります`);
    const last = block.rows.at(-1);
    const value = last[NATIONAL_COLUMN];
    if (typeof value !== "number") throw new Error(`${grade} の全国（${NATIONAL_COLUMN} 列）が数値ではありません`);
    const rounded = last[NATIONAL_ROUNDED_COLUMN];
    // O 列（整数に丸めた全国）と P 列がずれていれば列の配置が変わったとみなす
    if (typeof rounded === "number" && Math.abs(rounded - value) > 1) {
      throw new Error(`${grade} の全国の値が O 列（${rounded}）と P 列（${value}）で食い違っています`);
    }
    found[grade] = { price: round1(value), surveyDate: excelSerialToIso(block.lastDate) };
  }
  for (const grade of ["regular", "highOctane", "diesel"]) {
    if (!found[grade]) throw new Error(`${grade} のブロックが見つかりません`);
  }
  const dates = new Set(Object.values(found).map((f) => f.surveyDate));
  if (dates.size !== 1) throw new Error(`油種ごとの最新の調査日がそろっていません: ${[...dates].join(", ")}`);
  return {
    regular: found.regular.price,
    highOctane: found.highOctane.price,
    diesel: found.diesel.price,
    surveyDate: found.regular.surveyDate,
  };
}

/** シート上部の公表日（B2 の日付シリアル値）。無ければ null */
export function extractPublishedDate(rows) {
  const v = rows.find((r) => r.row === 2)?.cells.B;
  return isDateSerial(v) ? excelSerialToIso(v) : null;
}

/** xlsx の中身から 1 枚目のシートを選んで行にする（workbook.xml の最初のシートを rels で解決する） */
export function readFirstSheetRows(files) {
  const text = (name) => {
    const f = files.get(name);
    if (!f) throw new Error(`xlsx に ${name} がありません`);
    return f.toString("utf8");
  };
  const workbook = text("xl/workbook.xml");
  const rid = workbook.match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1];
  const rels = text("xl/_rels/workbook.xml.rels");
  const target = [...rels.matchAll(/<Relationship\b[^>]*>/g)]
    .map((m) => m[0])
    .find((tag) => tag.includes(`Id="${rid}"`))
    ?.match(/Target="([^"]+)"/)?.[1];
  if (!target) throw new Error("xlsx の 1 枚目のシートが見つかりません");
  const sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
  const shared = files.has("xl/sharedStrings.xml") ? parseSharedStrings(text("xl/sharedStrings.xml")) : [];
  return parseSheetRows(text(sheetPath), shared);
}

/** lib/nationalGasPrice.ts から現在の値を読む */
export function parseCurrentPrice(source) {
  const num = (key) => {
    const m = source.match(new RegExp(`\\b${key}: (\\d+(?:\\.\\d+)?),`));
    if (!m) throw new Error(`lib/nationalGasPrice.ts に ${key} が見つかりません`);
    return Number(m[1]);
  };
  const str = (key) => {
    const m = source.match(new RegExp(`\\b${key}: "([^"]*)",`));
    if (!m) throw new Error(`lib/nationalGasPrice.ts に ${key} が見つかりません`);
    return m[1];
  };
  return {
    regular: num("regular"),
    highOctane: num("highOctane"),
    diesel: num("diesel"),
    surveyDate: str("surveyDate"),
    publishedDate: str("publishedDate"),
  };
}

/**
 * 取得した値の妥当性を確かめる。問題があればエラーの文の配列（空なら妥当）。
 * 調査日が現在値と同じなら「更新なし」で、エラーではない（呼び出し側で判定する）。
 */
export function validatePrice(next, current, today = new Date().toISOString().slice(0, 10)) {
  const errors = [];
  for (const key of ["regular", "highOctane", "diesel"]) {
    const v = next[key];
    if (typeof v !== "number" || !Number.isFinite(v) || v < PRICE_RANGE.min || v > PRICE_RANGE.max) {
      errors.push(`${key} が ${PRICE_RANGE.min}〜${PRICE_RANGE.max} 円/L の範囲外です: ${v}`);
    }
  }
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!iso.test(next.surveyDate ?? "")) errors.push(`調査日の形式が不正です: ${next.surveyDate}`);
  if (!iso.test(next.publishedDate ?? "")) errors.push(`公表日の形式が不正です: ${next.publishedDate}`);
  if (errors.length) return errors;
  if (next.surveyDate < current.surveyDate) {
    errors.push(`調査日 ${next.surveyDate} が現在の値（${current.surveyDate}）より古いです`);
  }
  if (next.publishedDate < next.surveyDate) errors.push(`公表日 ${next.publishedDate} が調査日 ${next.surveyDate} より前です`);
  // 実行環境は UTC のことがあるので 1 日の余裕を見る
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  if (next.surveyDate > tomorrow) errors.push(`調査日 ${next.surveyDate} が未来の日付です`);
  if (next.publishedDate > tomorrow) errors.push(`公表日 ${next.publishedDate} が未来の日付です`);
  return errors;
}

/** lib/nationalGasPrice.ts の 3 つの値と調査日・公表日を書き換えた文字列（単価は小数第 1 位まで。181 円ちょうどでも 181.0） */
export function renderNationalGasPrice(source, next) {
  const replacements = [
    ["regular", next.regular.toFixed(1)],
    ["highOctane", next.highOctane.toFixed(1)],
    ["diesel", next.diesel.toFixed(1)],
    ["surveyDate", `"${next.surveyDate}"`],
    ["publishedDate", `"${next.publishedDate}"`],
  ];
  let out = source;
  for (const [key, value] of replacements) {
    const re = new RegExp(`(\\b${key}: )(?:\\d+(?:\\.\\d+)?|"[^"]*")(,)`, "g");
    const hits = out.match(re)?.length ?? 0;
    if (hits !== 1) throw new Error(`lib/nationalGasPrice.ts の ${key} が 1 か所ではありません（${hits} か所）`);
    out = out.replace(re, `$1${value}$2`);
  }
  return out;
}

/** 表示・PR 本文用の差分の表（Markdown） */
export function formatSummary(current, next) {
  const row = (label, a, b) => {
    const diff = typeof a === "number" ? ` (${b - a >= 0 ? "+" : ""}${(b - a).toFixed(1)})` : "";
    const fmt = (v) => (typeof v === "number" ? v.toFixed(1) : v);
    return `| ${label} | ${fmt(a)} | ${fmt(b)}${diff} |`;
  };
  return [
    "| 項目 | 現在 | 取得した値 |",
    "|---|---|---|",
    row("レギュラー（円/L）", current.regular, next.regular),
    row("ハイオク（円/L）", current.highOctane, next.highOctane),
    row("軽油（円/L）", current.diesel, next.diesel),
    row("調査日", current.surveyDate, next.surveyDate),
    row("公表日", current.publishedDate, next.publishedDate),
  ].join("\n");
}

async function fetchWithHeaders(url, referer) {
  const headers = { "User-Agent": USER_AGENT, "Accept-Language": "ja,en;q=0.8" };
  if (referer) headers.Referer = referer;
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${url} の取得に失敗しました: HTTP ${res.status}`);
  return res;
}

/** 取得 → 解析。公表日は xlsx の B2、無ければファイル名の日付 */
export async function fetchLatestPrice() {
  const html = await (await fetchWithHeaders(RESULTS_URL)).text();
  const link = findDetailXlsx(html);
  const buf = Buffer.from(await (await fetchWithHeaders(link.url, RESULTS_URL)).arrayBuffer());
  if (buf.subarray(0, 4).toString("binary") !== "PK\x03\x04") {
    throw new Error(`${link.url} が xlsx ではありません（HTML が返った可能性があります）`);
  }
  const rows = readFirstSheetRows(unzip(buf));
  const prices = extractNationalPrices(rows);
  const sheetPublished = extractPublishedDate(rows);
  if (sheetPublished && sheetPublished !== link.publishedDate) {
    throw new Error(`公表日がシート（${sheetPublished}）とファイル名（${link.publishedDate}）で食い違っています`);
  }
  return { ...prices, publishedDate: sheetPublished ?? link.publishedDate, xlsxUrl: link.url };
}

/** GitHub Actions の出力（$GITHUB_OUTPUT）に書く */
function setOutputs(outputs) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return;
  const lines = Object.entries(outputs).map(([k, v]) =>
    String(v).includes("\n") ? `${k}<<__EOF__\n${v}\n__EOF__` : `${k}=${v}`
  );
  appendFileSync(file, `${lines.join("\n")}\n`);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const source = readFileSync(TARGET_FILE, "utf8");
  const current = parseCurrentPrice(source);
  const next = await fetchLatestPrice();
  const errors = validatePrice(next, current);
  const summary = formatSummary(current, next);
  console.log(`取得元: ${next.xlsxUrl}`);
  console.log(summary);
  if (errors.length) throw new Error(`取得した値が妥当ではありません:\n- ${errors.join("\n- ")}`);
  const updated = next.surveyDate > current.surveyDate;
  setOutputs({ updated, survey_date: next.surveyDate, published_date: next.publishedDate, xlsx_url: next.xlsxUrl, summary });
  if (!updated) {
    console.log(`更新なし: 調査日 ${next.surveyDate} は現在の値と同じです`);
    return;
  }
  const rendered = renderNationalGasPrice(source, next);
  if (dryRun) {
    console.log(`--dry-run: 調査日 ${next.surveyDate} の値に更新できます（ファイルは書き換えていません）`);
    return;
  }
  writeFileSync(TARGET_FILE, rendered);
  console.log(`lib/nationalGasPrice.ts を調査日 ${next.surveyDate} の値に更新しました`);
}

if (process.argv[1]?.endsWith("update-gas-price.mjs")) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
