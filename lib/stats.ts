/**
 * 統計ページ（/stats）用の純粋な集計ロジック。
 *
 * React / DOM に依存しない関数のみを置く（単体テスト対象）。
 * 給油記録の型は useFuelRecords から型のみ import する。
 *
 * 【燃費の平均について（満タン法）】
 * 本アプリの燃費は満タン法（燃費 = 前回の満タン給油からの走行距離 ÷ 給油量）で算出する。
 * この前提では、期間全体の燃費は「各給油の燃費の単純平均」ではなく
 * 「Σ走行距離 ÷ Σ給油量」（走行距離で重み付けした調和平均に相当）が正しい。
 * 例: 100km/10L (10km/L) と 500km/25L (20km/L) の 2 回なら、
 *   単純平均 = 15 km/L だが、実際は 600km / 35L = 17.14 km/L。
 * そのため summarize() の avgEfficiency は Σkm/ΣL を返し、
 * 参考値として単純平均 meanEfficiency も併せて返す。
 *
 * 【run 単位で集計する理由】
 * 部分給油・持ち越し行（オドメーターモードでオドメーターが無い・戻った記録）は、距離と給油量の片方しか持たない、
 * あるいは次の満タン給油の距離に自分の分が含まれる。記録ごとに「距離と給油量の両方がある記録」を拾うと
 * 分子と分母で区間がずれて値が歪む（例: A(1000 km) → B(ODO なし, 20 L) → C(1600 km, 20 L) で C の 600 km を 20 L で割ってしまう）。
 * そこで燃費と走行コストは、連鎖計算（lib/fillChain.ts の applyFillChain）が満タン給油で閉じた run の記録に付ける
 * run_distance / run_fuel / run_cost（導出値）だけで Σ ÷ Σ を求める。
 * 全件が満タンのトリップモードでは各記録が 1 件の run なので、従来の記録ごとの集計と同じ値になる。
 */

import type { FuelRecord } from "./useFuelRecords";

/** 期間フィルタの種別（全期間 / 1年 / 6ヶ月 / 3ヶ月） */
export type Period = "all" | "1y" | "6m" | "3m";

/** 期間種別 → 遡る月数（"all" は undefined） */
export const PERIOD_MONTHS: Record<Exclude<Period, "all">, number> = {
  "1y": 12,
  "6m": 6,
  "3m": 3,
};

/** 燃費グラフ 1 点分 */
export type EfficiencyPoint = {
  /** ローカル日付 0 時のエポックミリ秒（X 軸用） */
  timestamp: number;
  /** YYYY-MM-DD */
  name: string;
  efficiency: number;
  cost: number;
  gasStation: string;
};

/** 月別支払総額グラフ 1 本分 */
export type MonthlyCostPoint = {
  /** 表示ラベル "YYYY/M月" */
  month: string;
  /** 並び替え用キー "YYYY-MM" */
  key: string;
  cost: number;
};

/** summarize() の戻り値 */
export type StatsSummary = {
  /** 集計対象の記録件数 */
  count: number;
  /**
   * 期間平均燃費 = Σrun_distance ÷ Σrun_fuel（満タン給油で閉じた run のうち、距離と給油量が正のもの）。対象なしは null。
   * run は連鎖計算が燃費の出た記録に付ける導出値（部分給油・持ち越し行の分を含む）
   */
  avgEfficiency: number | null;
  /** 各記録の燃費（fuel_efficiency > 0）の単純平均。参考値。対象なしは null */
  meanEfficiency: number | null;
  /** 支払総額の合計（有効な数値の記録すべて） */
  totalCost: number;
  /** 平均単価 = Σ支払総額 ÷ Σ給油量（両方が正の記録のみ）。対象なしは null */
  avgPricePerUnit: number | null;
  /**
   * 走行コスト = Σrun_cost ÷ Σrun_distance（満タン給油で閉じた run のうち、支払総額がすべて分かり、距離と支払総額が正のもの）。
   * 対象なしは null
   */
  costPerKm: number | null;
  /** 走行距離の合計（正の値の記録すべて） */
  totalDistance: number;
  /** 給油量の合計（正の値の記録すべて） */
  totalFuel: number;
};

/** 燃費グラフの Y 軸設定 */
export type EfficiencyAxis = {
  /** [min, max]。データなしは undefined（recharts の auto に任せる） */
  domain: [number, number] | undefined;
  /** 目盛り値（平均値を含む）。データなしは undefined */
  ticks: number[] | undefined;
  /** 目盛りに差し込んだ平均値（小数第2位で丸め済み）。平均なしは null */
  averageTick: number | null;
};

// ---------------------------------------------------------------------------
// 基本ヘルパ
// ---------------------------------------------------------------------------

/** 有限の number か（null / undefined / NaN / Infinity を弾く） */
export function hasNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** 正の有限 number か */
export function hasPositiveNumber(v: unknown): v is number {
  return hasNumber(v) && v > 0;
}

const DATE_PREFIX_RE = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * 記録の date を正規化して "YYYY-MM-DD" を返す。
 * 先頭が YYYY-MM-DD 形式でない、または実在しない日付（2月30日など）の場合は null。
 * ISO 日時 ("2025-01-05T00:00:00Z" など) は日付部分だけを採用する。
 */
export function normalizeDateString(date: unknown): string | null {
  if (typeof date !== "string") return null;
  const m = DATE_PREFIX_RE.exec(date);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  // 実在チェック（ローカル日付として構築し、繰り上がりが起きていないか確認）
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** 記録に有効な日付があるか */
export function hasValidDate(record: Pick<FuelRecord, "date">): boolean {
  return normalizeDateString(record.date) !== null;
}

/** 日付が不明（欠落・不正）な記録の件数 */
export function countUnknownDate(records: ReadonlyArray<Pick<FuelRecord, "date">>): number {
  let n = 0;
  for (const r of records) if (!hasValidDate(r)) n++;
  return n;
}

/** "YYYY-MM-DD" をローカル 0 時の Date に変換する（不正なら null） */
export function parseLocalDate(date: unknown): Date | null {
  const s = normalizeDateString(date);
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Date をローカル暦の "YYYY-MM-DD" 文字列にする。
 * `toISOString()` は UTC に変換されるため、日本時間の深夜などで日付がずれる。
 * 期間フィルタの境界はこの文字列同士の辞書順比較で行う。
 */
export function localDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * n ヶ月前のローカル日付を返す（日は月末に丸める）。
 * `Date#setMonth` は 3/31 → 2/31 → 3/3 のように繰り上がるため使わない。
 * 例: 2025-03-31 から 1 ヶ月前 → 2025-02-28。
 * 返り値の時刻は 0 時 0 分 0 秒。
 */
export function subtractMonthsClamped(d: Date, n: number): Date {
  const totalMonths = d.getFullYear() * 12 + d.getMonth() - n;
  const y = Math.floor(totalMonths / 12);
  const m = totalMonths - y * 12; // 0..11
  const lastDay = new Date(y, m + 1, 0).getDate();
  const day = Math.min(d.getDate(), lastDay);
  return new Date(y, m, day);
}

// ---------------------------------------------------------------------------
// フィルタ・並び替え
// ---------------------------------------------------------------------------

/**
 * 期間フィルタ。
 * - "all": 全記録をそのまま返す（日付不明の記録も含む）。
 * - それ以外: today から n ヶ月前（日付は月末に丸め）の "YYYY-MM-DD" を下限とし、
 *   `record.date >= cutoff` を文字列の辞書順で比較する。日付不明の記録は除外する。
 *
 * タイムゾーンに依存しないよう、Date の比較ではなく文字列比較にしている
 * （`new Date("YYYY-MM-DD")` は UTC 0 時に解釈され、ローカルの now とずれる）。
 */
export function filterByPeriod<T extends Pick<FuelRecord, "date">>(
  records: ReadonlyArray<T>,
  period: Period,
  today: Date
): T[] {
  if (period === "all") return [...records];
  const months = PERIOD_MONTHS[period];
  const cutoff = localDateString(subtractMonthsClamped(today, months));
  return records.filter(r => {
    const d = normalizeDateString(r.date);
    return d !== null && d >= cutoff;
  });
}

/**
 * 日付の昇順に並び替える。日付不明の記録は末尾に置く。
 * 同一日付は id の昇順で安定化する。
 */
export function sortByDateAsc<T extends Pick<FuelRecord, "date" | "id">>(records: ReadonlyArray<T>): T[] {
  return [...records].sort((a, b) => {
    const da = normalizeDateString(a.date);
    const db = normalizeDateString(b.date);
    if (da === db) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    if (da === null) return 1;
    if (db === null) return -1;
    return da < db ? -1 : 1;
  });
}

/** 統計に使える値（燃費または支払総額）を 1 つ以上持つ記録か */
export function hasStatsData(record: Pick<FuelRecord, "fuel_efficiency" | "total_cost">): boolean {
  return hasNumber(record.fuel_efficiency) || hasNumber(record.total_cost);
}

// ---------------------------------------------------------------------------
// 集計
// ---------------------------------------------------------------------------

/**
 * サマリーカード用の集計。
 *
 * 比率系の指標は、分子と分母の両方が正の値として存在する対象だけで「合計 ÷ 合計」を求める。
 * 片方しか無いものを混ぜると、分子と分母で母集団が異なり値が歪むため。
 * - 平均燃費・走行コスト: 満タン給油で閉じた run 単位（run_distance / run_fuel / run_cost を持つ記録。ファイル先頭のコメント参照）。
 *   期間フィルタ後の記録を渡した場合、run を閉じた記録が期間内なら、その run の全体（期間より前の部分給油を含む）を数える
 * - 平均単価: 記録単位（支払総額と給油量の両方が正の記録）
 * 合計（totalDistance / totalFuel / totalCost）は記録ごとの値をそのまま合算する（部分給油・持ち越し行も含む）。
 * 各記録の燃費の単純平均は meanEfficiency として参考値で返す。
 */
export function summarize(records: ReadonlyArray<FuelRecord>): StatsSummary {
  let totalCost = 0;
  let totalDistance = 0;
  let totalFuel = 0;

  // run 単位の集計（満タン給油で閉じた run のみ）
  let effDistance = 0;
  let effFuel = 0;
  let kmCost = 0;
  let kmDistance = 0;
  // 記録単位のペア集計（両方が正の記録のみ）
  let priceCost = 0;
  let priceFuel = 0;

  let effSum = 0;
  let effCount = 0;

  for (const r of records) {
    const cost = r.total_cost;
    const fuel = r.fuel_amount;
    const dist = r.total_distance;

    if (hasNumber(cost)) totalCost += cost;
    if (hasPositiveNumber(dist)) totalDistance += dist;
    if (hasPositiveNumber(fuel)) totalFuel += fuel;

    const runDistance = r.run_distance;
    const runFuel = r.run_fuel;
    const runCost = r.run_cost;
    if (hasPositiveNumber(runDistance) && hasPositiveNumber(runFuel)) {
      effDistance += runDistance;
      effFuel += runFuel;
    }
    if (hasPositiveNumber(runDistance) && hasPositiveNumber(runCost)) {
      kmCost += runCost;
      kmDistance += runDistance;
    }
    if (hasPositiveNumber(cost) && hasPositiveNumber(fuel)) {
      priceCost += cost;
      priceFuel += fuel;
    }
    if (hasPositiveNumber(r.fuel_efficiency)) {
      effSum += r.fuel_efficiency;
      effCount++;
    }
  }

  return {
    count: records.length,
    avgEfficiency: effFuel > 0 ? effDistance / effFuel : null,
    meanEfficiency: effCount > 0 ? effSum / effCount : null,
    totalCost,
    avgPricePerUnit: priceFuel > 0 ? priceCost / priceFuel : null,
    costPerKm: kmDistance > 0 ? kmCost / kmDistance : null,
    totalDistance,
    totalFuel,
  };
}

/**
 * 燃費グラフ用の系列を作る。
 * 対象: 有効な日付があり、燃費が正の記録。日付の昇順。
 * 金額だけの記録（燃費 null）を 0 として描くと折れ線が急落するため除外する。
 */
export function buildEfficiencySeries(records: ReadonlyArray<FuelRecord>): EfficiencyPoint[] {
  const points: EfficiencyPoint[] = [];
  for (const r of records) {
    if (!hasPositiveNumber(r.fuel_efficiency)) continue;
    const date = normalizeDateString(r.date);
    if (!date) continue;
    const dt = parseLocalDate(date) as Date;
    points.push({
      timestamp: dt.getTime(),
      name: date,
      efficiency: r.fuel_efficiency,
      cost: hasNumber(r.total_cost) ? r.total_cost : 0,
      gasStation: r.gas_station || "不明",
    });
  }
  points.sort((a, b) => a.timestamp - b.timestamp || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return points;
}

/**
 * 月別の支払総額を集計する。
 * 対象: 有効な日付があり、支払総額が正の記録。年月の昇順。
 */
export function buildMonthlyCostSeries(records: ReadonlyArray<FuelRecord>): MonthlyCostPoint[] {
  const map = new Map<string, number>();
  for (const r of records) {
    if (!hasPositiveNumber(r.total_cost)) continue;
    const date = normalizeDateString(r.date);
    if (!date) continue;
    const key = date.slice(0, 7); // YYYY-MM
    map.set(key, (map.get(key) ?? 0) + r.total_cost);
  }
  return Array.from(map.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([key, cost]) => {
      const [y, m] = key.split("-");
      return { key, month: `${y}/${Number(m)}月`, cost };
    });
}

/**
 * 燃費グラフの Y 軸の範囲と目盛りを求める。
 * データ範囲に 15% の余白を付け、5 等分した目盛りに平均値（小数第2位で丸め）を差し込む。
 * 目盛りの判定で平均値と比較する際は、ここで返す averageTick（丸め済み）を使うこと。
 * 元の平均値（丸め前）と比較すると、浮動小数の誤差でラベルが一致しない。
 */
export function buildEfficiencyAxis(
  series: ReadonlyArray<Pick<EfficiencyPoint, "efficiency">>,
  average: number | null
): EfficiencyAxis {
  if (series.length === 0) return { domain: undefined, ticks: undefined, averageTick: null };

  const values = series.map(p => p.efficiency);
  let min = Math.min(...values);
  let max = Math.max(...values);
  const averageTick = average != null && average > 0 ? roundTo2(average) : null;
  if (averageTick != null) {
    min = Math.min(min, averageTick);
    max = Math.max(max, averageTick);
  }

  const pad = (max - min) * 0.15 || 1;
  const yMin = Math.max(0, min - pad);
  const yMax = max + pad;
  const step = (yMax - yMin) / 4;
  const base = [0, 1, 2, 3, 4].map(i => roundTo2(yMin + step * i));
  const ticks = averageTick != null
    ? Array.from(new Set([...base, averageTick])).sort((a, b) => a - b)
    : base;

  return { domain: [yMin, yMax], ticks, averageTick };
}

/** 小数第2位で丸める（toFixed(2) と同じ丸め） */
export function roundTo2(v: number): number {
  return parseFloat(v.toFixed(2));
}

/**
 * X 軸（時刻）の表示範囲。データ範囲の 5%（最低 1 日）を前後に余白として付ける。
 */
export function buildTimeDomain(series: ReadonlyArray<Pick<EfficiencyPoint, "timestamp">>): [number, number] | null {
  if (series.length === 0) return null;
  const times = series.map(p => p.timestamp);
  const min = Math.min(...times);
  const max = Math.max(...times);
  const oneDay = 86_400_000;
  const padding = Math.max((max - min) * 0.05, oneDay);
  return [min - padding, max + padding];
}
