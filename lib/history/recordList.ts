import { normalizeDateString } from "../dates";
import type { FuelRecord } from "../types";

/**
 * 履歴画面（/history）の絞り込み・並べ替え・表示用の純粋関数（React・DOM に依存しない）。
 */

/** 並び順。date = 給油日の新しい順、created_at = 登録（作成）の新しい順 */
export type HistorySort = "date" | "created_at";

export const SORT_LABELS: Readonly<Record<HistorySort, string>> = {
  date: "給油日の新しい順",
  created_at: "登録の新しい順",
};

/** 「すべて」を表す絞り込みの値 */
export const ALL = "all";

/** 月フィルタの選択肢（"1"〜"12"） */
export const MONTH_OPTIONS: readonly string[] = Array.from({ length: 12 }, (_, i) => String(i + 1));

/** created_at（ISO 日時）をミリ秒に変換する。欠落・解析不能なら 0（最も古い扱い） */
export function createdAtMs(createdAt: string | null | undefined): number {
  if (!createdAt) return 0;
  const t = new Date(createdAt).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** 記録のある年（"YYYY"）の新しい順。日付が欠落・不正な記録（一覧では「日付なし」）は数えない */
export function availableYears(records: readonly Pick<FuelRecord, "date">[]): string[] {
  const years = new Set<string>();
  records.forEach(r => {
    const date = normalizeDateString(r.date);
    if (date) years.add(date.slice(0, 4));
  });
  return Array.from(years).sort((a, b) => b.localeCompare(a));
}

/** 年・月で絞り込む（"all" は絞り込まない）。日付が欠落・不正な記録は、どちらかで絞り込んでいれば除く */
export function filterByYearMonth<T extends Pick<FuelRecord, "date">>(records: readonly T[], year: string, month: string): readonly T[] {
  if (year === ALL && month === ALL) return records;
  return records.filter(r => {
    const date = normalizeDateString(r.date);
    if (!date) return false;
    const y = date.slice(0, 4);
    const m = String(parseInt(date.slice(5, 7), 10));
    if (year !== ALL && y !== year) return false;
    if (month !== ALL && m !== month) return false;
    return true;
  });
}

type Sortable = Pick<FuelRecord, "id" | "date" | "created_at">;

/**
 * 記録を並べ替える（新しい配列を返す）。
 * - created_at: 登録（作成）の新しい順。created_at を持たないローカルの旧データは id（Date.now 由来）でフォールバックする
 * - date: 給油日の新しい順。日付が欠落・不正な記録は最も古い扱い（末尾）。同じ給油日なら登録の新しい順 → id の順
 *   （"YYYY-MM-DD" 同士の辞書順比較なので NaN が出ず、比較関数の契約を満たす）
 */
export function sortRecords<T extends Sortable>(records: readonly T[], sort: HistorySort): T[] {
  const byCreated = (a: T, b: T) => {
    const createdA = createdAtMs(a.created_at);
    const createdB = createdAtMs(b.created_at);
    if (createdB !== createdA) return createdB - createdA;
    return b.id > a.id ? 1 : b.id < a.id ? -1 : 0;
  };
  if (sort === "created_at") return [...records].sort(byCreated);
  return [...records].sort((a, b) => {
    const dateA = normalizeDateString(a.date);
    const dateB = normalizeDateString(b.date);
    if (dateA !== dateB) {
      if (dateA === null) return 1;
      if (dateB === null) return -1;
      return dateA < dateB ? 1 : -1;
    }
    return byCreated(a, b);
  });
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

/** 日付の欄（日 2 桁と曜日）。日付が欠落・不正なら null */
export function dayParts(date: unknown): { day: string; weekday: string; month: number; year: number } | null {
  const normalized = normalizeDateString(date);
  if (!normalized) return null;
  const [y, m, d] = normalized.split("-").map(Number);
  return { day: String(d).padStart(2, "0"), weekday: WEEKDAYS[new Date(y, m - 1, d).getDay()], month: m, year: y };
}

/** 数値なら toFixed、そうでなければ null */
function fixed(value: number | null | undefined, digits: number): string | null {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : null;
}

/** 給油量（L）の表示（小数 2 桁）。無ければ null */
export function formatLiters(value: number | null | undefined): string | null {
  return fixed(value, 2);
}

/** 燃費（km/L）の表示（小数 2 桁）。0・無ければ null */
export function formatEfficiency(value: number | null | undefined): string | null {
  return value ? fixed(value, 2) : null;
}

/** 金額（円）の表示（「¥4,920」）。無ければ null */
export function formatYen(value: number | null | undefined): string | null {
  return typeof value === "number" && Number.isFinite(value) ? `¥${value.toLocaleString("ja-JP")}` : null;
}

/** 距離（km）の表示（桁区切り・小数 1 桁）。無ければ null */
export function formatDistance(value: number | null | undefined): string | null {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("ja-JP", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    : null;
}

/** "#record-<id>" から記録の ID を取り出す。形が違えば null */
export function recordIdFromHash(hash: string): string | null {
  const m = /^#record-(.+)$/.exec(hash);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

/** 行の要素 ID（ホームから `/history#record-<id>` で開ける） */
export function recordElementId(id: string): string {
  return `record-${id}`;
}
