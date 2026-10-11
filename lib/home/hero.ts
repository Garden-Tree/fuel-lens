/**
 * ホーム画面のヒーローカード（前回の燃費のメーター）の表示用モデル（純粋関数）。
 * 燃費は useFuelRecords が applyFillChain で連鎖計算した値をそのまま使う（保存値は信頼しない。CLAUDE.md 不変条件 1）。
 */

import { efficiencyNullReason } from "../format";
import { summarize } from "../stats";
import type { FuelRecord } from "../types";
import { gaugeScaleOf, type GaugeScale } from "./gauge";

export type EfficiencyDelta = {
  /** 符号付きの差（km/L、小数第 2 位で丸め済み） */
  value: number;
  /** 向上（▲）/ 悪化（▼）/ 変わらない（±） */
  direction: "up" | "down" | "flat";
  /** 表示用の絶対値（例: "2.54"） */
  text: string;
};

export type HeroModel = {
  /** 表示する記録の燃費。燃費が出ていなければ null（理由は nullReason） */
  efficiency: number | null;
  /** 燃費が null の理由（lib/format.ts の efficiencyNullReason。例: 「部分給油（次の満タンで計算）」） */
  nullReason: string | null;
  /** 1 つ前（より古い）の燃費のある記録との差。比べられなければ null */
  delta: EfficiencyDelta | null;
  /** 平均燃費 = Σ区間距離 ÷ Σ給油量（統計ページの平均燃費と同じ lib/stats の summarize）。無ければ null */
  average: number | null;
  scale: GaugeScale;
};

function positive(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

/** 燃費の差（今回 − 前回）。小数第 2 位で丸め、0.01 未満の差は「変わらない」 */
export function efficiencyDeltaOf(current: number, previous: number): EfficiencyDelta {
  const value = Math.round((current - previous) * 100) / 100;
  const direction = value > 0 ? "up" : value < 0 ? "down" : "flat";
  return { value, direction, text: Math.abs(value).toFixed(2) };
}

/**
 * ヒーローに出す記録を選ぶ。
 * 最新の記録（records[0]）の燃費が出ていない（部分給油・記録漏れなど）ときは、燃費の出ている最も新しい記録を出し、
 * 最新の記録は注記（skipped）で知らせる。
 * この画面で保存した直後の記録（スキャン・手動入力とも。justSaved）はその記録自体を確認するため差し替えない。
 * 最新ではない記録（保存直後の古い日付の記録など）も差し替えない。
 * @param records 連鎖計算済み・日付の降順
 * @param record 表示する記録（直前に保存した記録、または最新の記録）
 * @param justSaved record がこの画面で保存した直後の記録か
 */
export function heroDisplayOf(
  records: ReadonlyArray<FuelRecord>,
  record: FuelRecord,
  justSaved: boolean
): { display: FuelRecord; skipped: FuelRecord | null } {
  const unchanged = { display: record, skipped: null };
  if (justSaved || positive(record.fuel_efficiency) || records[0]?.id !== record.id) return unchanged;
  const fallback = records.slice(1).find(r => positive(r.fuel_efficiency));
  return fallback ? { display: fallback, skipped: record } : unchanged;
}

/**
 * ヒーローカードのモデル。
 * @param records 選択中の車両の記録（連鎖計算済み・日付の降順。useVehicleScope の records）
 * @param record 表示する記録（直前に保存した記録、または最新の記録）
 */
export function heroModelOf(records: ReadonlyArray<FuelRecord>, record: FuelRecord): HeroModel {
  const efficiency = positive(record.fuel_efficiency) ? record.fuel_efficiency : null;
  const index = records.findIndex(r => r.id === record.id);
  const older = index >= 0 ? records.slice(index + 1) : [];
  const previous = older.find(r => positive(r.fuel_efficiency))?.fuel_efficiency ?? null;
  const delta = efficiency !== null && previous !== null ? efficiencyDeltaOf(efficiency, previous) : null;

  const average = summarize(records).avgEfficiency;
  const values = records.map(r => r.fuel_efficiency);
  const scale = gaugeScaleOf([...values, efficiency, average]);

  return {
    efficiency,
    nullReason: efficiency === null ? efficiencyNullReason(record) : null,
    delta,
    average,
    scale,
  };
}
