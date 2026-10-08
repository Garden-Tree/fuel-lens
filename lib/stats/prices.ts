/**
 * 統計: 単価（recordPrice / averagePrice）、スタンド別の集計（summarizeStations）、前回比（priceDelta）。
 * 店舗名のまとめ方は lib/stations.ts の stationKey。平均単価は Σ支払総額 ÷ Σ給油量。
 */

import type { FuelRecord } from "../types";
import { calculateFuelMetrics } from "../calculations";
import { normalizeDateString, parseLocalDate } from "../dates";
import { detectStationBrand, normalizeStationName, stationKey } from "../stations";
import { hasPositiveNumber, sortByDateAsc } from "./period";

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

export type PricedRecord = { record: FuelRecord; date: string; price: number };

/** 単価のある・日付の有効な記録を日付の昇順（同日は id 順。sortByDateAsc と同じ）で返す */
export function pricedRecordsAsc(records: ReadonlyArray<FuelRecord>): PricedRecord[] {
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
