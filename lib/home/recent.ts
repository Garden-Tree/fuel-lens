/**
 * ホーム画面の「最近の記録」の行とヒーローカードの日付の表示用ヘルパー（純粋関数）。
 */

import { normalizeDateString } from "../dates";
import { isFuelType } from "../fillChain";
import { FUEL_TYPE_LABELS, type FuelRecord } from "../types";

/** ホームに出す最近の記録の件数 */
export const RECENT_RECORD_COUNT = 3;

/** "YYYY-MM-DD" → 「9月11日」。不正なら「日付不明」 */
export function formatMonthDay(date: unknown): string {
  const d = normalizeDateString(date);
  if (!d) return "日付不明";
  const [, m, day] = d.split("-").map(Number);
  return `${m}月${day}日`;
}

/** "YYYY-MM-DD" → 「9/11」。不正なら null */
export function formatShortDate(date: unknown): string | null {
  const d = normalizeDateString(date);
  if (!d) return null;
  const [, m, day] = d.split("-").map(Number);
  return `${m}/${day}`;
}

/** 店舗名（空白だけなら「店舗名なし」） */
export function stationLabel(station: string | null | undefined): string {
  const s = station?.trim();
  return s ? s : "店舗名なし";
}

/** 金額の表示（例: 「¥4,920」）。数値でなければ null */
export function formatYen(value: number | null | undefined): string | null {
  return typeof value === "number" && Number.isFinite(value) ? `¥${Math.round(value).toLocaleString("ja-JP")}` : null;
}

export type RecentRow = {
  id: string;
  title: string;
  /** 「9月11日」 */
  dateLabel: string;
  /** 燃料種別の表示名（未指定なら null） */
  fuelLabel: string | null;
  /** 「¥4,920」（支払総額が無ければ null） */
  costLabel: string | null;
  /** 燃費（連鎖計算済み）。無ければ null */
  efficiency: number | null;
  /** 部分給油（燃費は次の満タンで計算） */
  partial: boolean;
};

/** 最近の記録の 1 行分 */
export function recentRowOf(record: FuelRecord): RecentRow {
  const eff = record.fuel_efficiency;
  return {
    id: record.id,
    title: stationLabel(record.gas_station),
    dateLabel: formatMonthDay(record.date),
    fuelLabel: isFuelType(record.fuel_type) ? FUEL_TYPE_LABELS[record.fuel_type] : null,
    costLabel: formatYen(record.total_cost),
    efficiency: typeof eff === "number" && Number.isFinite(eff) && eff > 0 ? eff : null,
    partial: record.is_full === false,
  };
}
