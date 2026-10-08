/**
 * 統計ページ（/stats）用の純粋な集計ロジック。
 *
 * React / DOM に依存しない関数のみを置く（単体テスト対象）。
 * 給油記録の型は lib/types.ts、日付の検証・変換は lib/dates.ts。
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
 *
 * 【単価トレンドとスタンド比較】
 * buildPriceSeries / buildPriceAxis / summarizeStations / priceDelta（ファイル末尾）。単価は recordPrice、
 * 店舗名のまとめ方は lib/stations.ts の stationKey。平均単価は Σ支払総額 ÷ Σ給油量（summarize の avgPricePerUnit と同じ考え方）。
 */

import type { FuelRecord } from "./types";
import { calculateFuelMetrics } from "./calculations";
import { localDateString, normalizeDateString, parseLocalDate, subtractMonthsClamped } from "./dates";
import { detectStationBrand, normalizeStationName, stationKey } from "./stations";

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
/** グラフの時間軸の範囲 [最小, 最大]（epoch ms。buildTimeDomain） */
export type TimeDomain = [number, number];

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
  return buildValueAxis(series.map(p => p.efficiency), average, roundTo2);
}

/**
 * 値の配列から Y 軸の範囲と目盛りを求める共通処理（buildEfficiencyAxis / buildPriceAxis）。
 * round は目盛り値と平均値の丸め（燃費は小数第2位、単価は小数第1位）。
 */
function buildValueAxis(
  values: ReadonlyArray<number>,
  average: number | null,
  round: (v: number) => number
): EfficiencyAxis {
  if (values.length === 0) return { domain: undefined, ticks: undefined, averageTick: null };

  let min = Math.min(...values);
  let max = Math.max(...values);
  const averageTick = average != null && average > 0 ? round(average) : null;
  if (averageTick != null) {
    min = Math.min(min, averageTick);
    max = Math.max(max, averageTick);
  }

  const pad = (max - min) * 0.15 || 1;
  const yMin = Math.max(0, min - pad);
  const yMax = max + pad;
  const step = (yMax - yMin) / 4;
  const base = [0, 1, 2, 3, 4].map(i => round(yMin + step * i));
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
export function buildTimeDomain(series: ReadonlyArray<Pick<EfficiencyPoint, "timestamp">>): TimeDomain | null {
  if (series.length === 0) return null;
  const times = series.map(p => p.timestamp);
  const min = Math.min(...times);
  const max = Math.max(...times);
  const oneDay = 86_400_000;
  const padding = Math.max((max - min) * 0.05, oneDay);
  return [min - padding, max + padding];
}

/** 小数第1位で丸める（toFixed(1) と同じ丸め。単価の目盛り用） */
export function roundTo1(v: number): number {
  return parseFloat(v.toFixed(1));
}

// ---------------------------------------------------------------------------
// 単価トレンドとスタンド比較
// ---------------------------------------------------------------------------

/** 単価グラフ 1 点分 */
export type PricePoint = {
  /** ローカル日付 0 時のエポックミリ秒（X 軸用） */
  timestamp: number;
  /** 表示ラベル "M/D" */
  name: string;
  /** 単価 (円/L) */
  price: number;
  /** 正規化した店舗名（normalizeStationName）。店舗名なしは null */
  station: string | null;
  /** ブランドの表示名（detectBrand）。判定できなければ null */
  brand: string | null;
};

/** スタンド 1 件分の集計 */
export type StationSummary = {
  /** グルーピングキー（lib/stations.ts の stationKey） */
  key: string;
  /** 表示名。グループ内で最も多い店舗名（正規化済み）。同数なら最近使われたもの */
  label: string;
  /** ブランドの表示名。判定できなければ null */
  brand: string | null;
  /** 給油回数（店舗名が同じグループの記録数。単価の無い記録も数える） */
  visits: number;
  /** 単価の分かる給油の回数（recordPrice が null でない記録。日付の有無は問わない） */
  pricedVisits: number;
  /** 給油量の合計（正の値のみ） */
  totalFuel: number;
  /** 支払総額の合計（正の値のみ） */
  totalCost: number;
  /**
   * 平均単価 = Σ支払総額 ÷ Σ給油量（両方が正の記録のみ）。
   * 該当する記録が無ければ、単価がある記録の単価の単純平均。どちらも無ければ null
   */
  avgPrice: number | null;
  /** 最後に単価が分かる給油（日付が有効なもの）の単価。無ければ null */
  lastPrice: number | null;
  /** lastPrice の給油日（YYYY-MM-DD）。単価の分かる給油が無ければ最後の給油日。日付不明だけなら null */
  lastDate: string | null;
  /** 単価の最小・最大（日付が有効な給油のみ）。単価の分かる給油が無ければ null */
  minPrice: number | null;
  maxPrice: number | null;
};

/** summarizeStations() の戻り値 */
export type StationComparison = {
  /** 給油回数の降順（同数は最終給油日の新しい順、さらに表示名順） */
  groups: StationSummary[];
  /**
   * 平均単価が最も安いスタンドのキー。単価の分かる給油（pricedVisits）が 2 回以上のスタンドが 2 件以上あるときだけ選ぶ
   * （比べる相手がいない、または単価の分かる給油が 1 回だけで「最安」と表示しないため）。
   * 同額なら単価の分かる給油の多い方、さらに給油回数の多い方。該当なしは null
   */
  cheapestKey: string | null;
  /** 渡した全記録の平均単価（avgPrice と同じ規則。店舗名の無い記録も含む）。グラフの平均線に使う。対象なしは null */
  overallAvgPrice: number | null;
};

/** priceDelta() の 1 件分（単価と日付） */
export type PriceSample = { price: number; date: string };

/** priceDelta() の戻り値 */
export type PriceDelta = {
  /** 最新の単価（日付が最も新しい、単価の分かる記録）。無ければ null */
  latest: PriceSample | null;
  /** その 1 つ前の単価。無ければ null */
  previous: PriceSample | null;
  /** latest − previous（円/L）。どちらかが無ければ null */
  diffFromPrevious: number | null;
  /** latest の日付から遡って 30 日以内（latest 自身を除く）の単価の単純平均。対象なしは null */
  avg30: number | null;
  /** latest − avg30。avg30 が null なら null */
  diffFromAvg30: number | null;
  /** 同じく 90 日以内の単純平均 */
  avg90: number | null;
  /** latest − avg90。avg90 が null なら null */
  diffFromAvg90: number | null;
};

/**
 * 記録の単価 (円/L)。price_per_unit が正ならその値、無ければ支払総額 ÷ 給油量（calculateFuelMetrics と同じ丸め）。
 * どちらも求まらなければ null。
 */
export function recordPrice(record: Pick<FuelRecord, "price_per_unit" | "total_cost" | "fuel_amount">): number | null {
  if (hasPositiveNumber(record.price_per_unit)) return record.price_per_unit;
  if (hasPositiveNumber(record.total_cost) && hasPositiveNumber(record.fuel_amount)) {
    return calculateFuelMetrics(null, record.fuel_amount, record.total_cost).price_per_unit;
  }
  return null;
}

/**
 * 平均単価。Σ支払総額 ÷ Σ給油量（両方が正の記録のみ）を優先し、該当なしなら単価の単純平均。どちらも無ければ null。
 * 給油量で重み付けした値が、実際に払った 1 L あたりの金額になるため（summarize の avgPricePerUnit と同じ考え方）。
 */
function averagePrice(records: ReadonlyArray<FuelRecord>): number | null {
  let cost = 0;
  let fuel = 0;
  let priceSum = 0;
  let priceCount = 0;
  for (const r of records) {
    if (hasPositiveNumber(r.total_cost) && hasPositiveNumber(r.fuel_amount)) {
      cost += r.total_cost;
      fuel += r.fuel_amount;
    }
    const p = recordPrice(r);
    if (p != null) {
      priceSum += p;
      priceCount++;
    }
  }
  if (fuel > 0) return cost / fuel;
  return priceCount > 0 ? priceSum / priceCount : null;
}

type PricedRecord = { record: FuelRecord; date: string; price: number };

/** 単価のある・日付の有効な記録を日付の昇順（同日は id 順。sortByDateAsc と同じ）で返す */
function pricedRecordsAsc(records: ReadonlyArray<FuelRecord>): PricedRecord[] {
  const out: PricedRecord[] = [];
  for (const record of sortByDateAsc(records)) {
    const date = normalizeDateString(record.date);
    if (!date) continue;
    const price = recordPrice(record);
    if (price == null) continue;
    out.push({ record, date, price });
  }
  return out;
}

/**
 * 単価グラフ用の系列を作る。
 * 対象: 有効な日付があり、単価（recordPrice）が正の記録。日付の昇順（同日は id 順）。
 */
export function buildPriceSeries(records: ReadonlyArray<FuelRecord>): PricePoint[] {
  return pricedRecordsAsc(records).map(({ record, date, price }) => {
    const dt = parseLocalDate(date) as Date;
    const station = normalizeStationName(record.gas_station);
    return {
      timestamp: dt.getTime(),
      name: `${dt.getMonth() + 1}/${dt.getDate()}`,
      price,
      station: station || null,
      brand: detectStationBrand(record.gas_station)?.label ?? null,
    };
  });
}

/** 単価グラフの Y 軸。buildEfficiencyAxis と同じ考え方で、目盛りと平均値を小数第1位に丸める */
export function buildPriceAxis(
  series: ReadonlyArray<Pick<PricePoint, "price">>,
  average: number | null
): EfficiencyAxis {
  return buildValueAxis(series.map(p => p.price), average, roundTo1);
}

/**
 * スタンド別の単価を集計する。
 * 店舗名（gas_station）を lib/stations.ts の stationKey でまとめる（全角・半角、会社名、末尾の「店」などのゆれを吸収）。
 * 店舗名の無い記録はどのグループにも入れない（overallAvgPrice には含める）。
 */
export function summarizeStations(records: ReadonlyArray<FuelRecord>): StationComparison {
  type Acc = {
    key: string;
    records: FuelRecord[];
    /** 正規化した名前 → 件数と最後に使われた日付 */
    names: Map<string, { count: number; lastDate: string }>;
  };
  const accs = new Map<string, Acc>();
  for (const r of sortByDateAsc(records)) {
    const key = stationKey(r.gas_station);
    if (key == null) continue;
    let acc = accs.get(key);
    if (!acc) {
      acc = { key, records: [], names: new Map() };
      accs.set(key, acc);
    }
    acc.records.push(r);
    const name = normalizeStationName(r.gas_station);
    const entry = acc.names.get(name) ?? { count: 0, lastDate: "" };
    entry.count++;
    const date = normalizeDateString(r.date);
    if (date && date > entry.lastDate) entry.lastDate = date;
    acc.names.set(name, entry);
  }

  const groups: StationSummary[] = [];
  for (const acc of accs.values()) {
    // 表示名: 最も多い表記 → 最近使われた表記 → 文字列順
    let label = "";
    let best: { count: number; lastDate: string } | null = null;
    for (const [name, entry] of acc.names) {
      if (
        !best ||
        entry.count > best.count ||
        (entry.count === best.count && entry.lastDate > best.lastDate) ||
        (entry.count === best.count && entry.lastDate === best.lastDate && name < label)
      ) {
        best = entry;
        label = name;
      }
    }

    let totalFuel = 0;
    let totalCost = 0;
    let lastVisitDate: string | null = null;
    for (const r of acc.records) {
      if (hasPositiveNumber(r.fuel_amount)) totalFuel += r.fuel_amount;
      if (hasPositiveNumber(r.total_cost)) totalCost += r.total_cost;
      const date = normalizeDateString(r.date);
      if (date && (lastVisitDate == null || date > lastVisitDate)) lastVisitDate = date;
    }

    const priced = pricedRecordsAsc(acc.records);
    const prices = priced.map(p => p.price);
    const last = priced.length > 0 ? priced[priced.length - 1] : null;

    groups.push({
      key: acc.key,
      label,
      brand: detectStationBrand(acc.records[0].gas_station)?.label ?? null,
      visits: acc.records.length,
      pricedVisits: acc.records.filter(r => recordPrice(r) != null).length,
      totalFuel,
      totalCost,
      avgPrice: averagePrice(acc.records),
      lastPrice: last ? last.price : null,
      lastDate: last ? last.date : lastVisitDate,
      minPrice: prices.length > 0 ? Math.min(...prices) : null,
      maxPrice: prices.length > 0 ? Math.max(...prices) : null,
    });
  }

  groups.sort((a, b) => {
    if (a.visits !== b.visits) return b.visits - a.visits;
    const da = a.lastDate ?? "";
    const db = b.lastDate ?? "";
    if (da !== db) return da < db ? 1 : -1;
    return a.label < b.label ? -1 : a.label > b.label ? 1 : 0;
  });

  const candidates = groups.filter(g => g.pricedVisits >= 2 && g.avgPrice != null);
  let cheapestKey: string | null = null;
  if (candidates.length >= 2) {
    let best = candidates[0];
    for (const g of candidates.slice(1)) {
      const gp = g.avgPrice as number;
      const bp = best.avgPrice as number;
      if (
        gp < bp ||
        (gp === bp && g.pricedVisits > best.pricedVisits) ||
        (gp === bp && g.pricedVisits === best.pricedVisits && g.visits > best.visits)
      ) {
        best = g;
      }
    }
    cheapestKey = best.key;
  }

  return { groups, cheapestKey, overallAvgPrice: averagePrice(records) };
}

const DAY_MS = 86_400_000;

/**
 * 最新の単価を、1 つ前の単価・直前 30 日 / 90 日の平均と比べる（統計ページの「前回比」表示用）。
 * - 最新・前回: 単価の分かる、日付の有効な記録を日付の昇順（同日は id 順）に並べた最後と、その 1 つ前
 * - 30 日 / 90 日平均: 最新の記録の日付から遡って 30 日 / 90 日以内（境界の日を含む）の、最新以外の記録の単価の単純平均
 *   （「今回が最近の相場より高いか」を見る目安のため、給油量での重み付けはしない）
 * 差はすべて「最新 − 比較対象」（正なら値上がり）。
 */
export function priceDelta(records: ReadonlyArray<FuelRecord>): PriceDelta {
  const priced = pricedRecordsAsc(records);
  if (priced.length === 0) {
    return {
      latest: null,
      previous: null,
      diffFromPrevious: null,
      avg30: null,
      diffFromAvg30: null,
      avg90: null,
      diffFromAvg90: null,
    };
  }

  const lastItem = priced[priced.length - 1];
  const prevItem = priced.length >= 2 ? priced[priced.length - 2] : null;
  const latest: PriceSample = { price: lastItem.price, date: lastItem.date };
  const previous: PriceSample | null = prevItem ? { price: prevItem.price, date: prevItem.date } : null;

  const latestTime = (parseLocalDate(lastItem.date) as Date).getTime();
  const others = priced.slice(0, -1);
  const windowAverage = (days: number): number | null => {
    let sum = 0;
    let n = 0;
    for (const item of others) {
      // ローカル日付の差を日数にする（夏時間の 1 時間のずれは丸めで吸収）
      const diffDays = Math.round((latestTime - (parseLocalDate(item.date) as Date).getTime()) / DAY_MS);
      if (diffDays >= 0 && diffDays <= days) {
        sum += item.price;
        n++;
      }
    }
    return n > 0 ? sum / n : null;
  };
  const avg30 = windowAverage(30);
  const avg90 = windowAverage(90);

  return {
    latest,
    previous,
    diffFromPrevious: previous ? latest.price - previous.price : null,
    avg30,
    diffFromAvg30: avg30 != null ? latest.price - avg30 : null,
    avg90,
    diffFromAvg90: avg90 != null ? latest.price - avg90 : null,
  };
}
