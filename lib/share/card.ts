/**
 * 「今月の燃費をシェア」の画像（1200×630）とシェア文言の表示用モデル（純粋関数）。
 *
 * - 期間は今月（ローカル暦。lib/home/month.ts と同じ月の境界）。今月に燃費の出た満タン給油が 1 回も無ければ
 *   直近 30 日（今日を含む 30 日間）に切り替え、そこにも無ければ null（シェアのボタンを出さない）。
 * - 燃費は統計の平均燃費と同じ Σ区間距離 ÷ Σ給油量（lib/stats の summarize。満タン給油で閉じた run 単位なので、
 *   部分給油は次の満タン給油の run に合算され、単独では数えない）。記録は useVehicleScope の連鎖計算済みのもの
 *   （applyFillChain。保存値は信頼しない。CLAUDE.md 不変条件 1）。
 * - 給油回数・走行距離・給油代は期間内の全記録（部分給油を含む）の合計。
 *
 * 画像の描画は lib/share/drawCard.ts、共有の文言と URL は下の shareTextOf / SHARE_URL。
 */

import { localDateString, normalizeDateString } from "../dates";
import { gaugeBasisOf, gaugeFraction, gaugeScaleOf, type GaugeScale } from "../home/gauge";
import { monthKeyOf } from "../home/month";
import { formatYen } from "../home/recent";
import { hasNumber, hasPositiveNumber, summarize } from "../stats";
import { DEFAULT_SITE_URL } from "../siteUrl";
import type { FuelRecord } from "../types";

/** 共有するリンク（アクセス解析の beforeSend は utm_* だけ残すので、utm と参照元でシェアからの訪問を見る。lib/analytics/scrubUrl.ts） */
export const SHARE_URL = `${DEFAULT_SITE_URL}/?utm_source=share&utm_medium=card`;

/** 画像の右下に出す URL（スキームなし） */
export const SHARE_CARD_DOMAIN = DEFAULT_SITE_URL.replace(/^https?:\/\//, "");

/** 今月に燃費が無いときの代わりの期間（日数。今日を含む） */
export const SHARE_FALLBACK_DAYS = 30;

/** 共有文言のハッシュタグ */
export const SHARE_HASHTAGS = "#燃費記録 #FuelLens";

export type ShareCardStat = {
  /** 見出し（例: 「給油」） */
  label: string;
  /** 数値（例: 「3」「1,234」「¥12,345」） */
  value: string;
  /** 単位（例: 「回」「km」）。無ければ空文字 */
  unit: string;
};

export type ShareCardModel = {
  /** month = 今月、recent = 直近 30 日（今月に燃費が無いとき） */
  kind: "month" | "recent";
  /** 期間の見出し（例: 「2026年10月」「直近30日」） */
  periodLabel: string;
  /** 文言で使う期間（例: 「今月」「直近30日」） */
  periodPhrase: string;
  /** 車両名（空なら null） */
  vehicleName: string | null;
  /** 燃費（km/L。Σ区間距離 ÷ Σ給油量） */
  efficiency: number;
  /** 燃費の表示（小数第 2 位。例: 「62.54」） */
  efficiencyText: string;
  /** 補足の数値（給油 n 回・走行 xxx km・給油代 ¥x,xxx。分からない項目は省く） */
  stats: ShareCardStat[];
  /** 補足の 1 行（例: 「給油 3回・走行 1,234 km・給油代 ¥12,345」。画像の代替テキストに使う） */
  statsLine: string;
  /** ゲージの目盛り（ホームのヒーローと同じ gaugeScaleOf） */
  scale: GaugeScale;
  /** 燃費のゲージ上の位置（0〜1） */
  fraction: number;
  /** 保存するファイル名（例: 「fuellens-2026-10.png」） */
  filename: string;
};

type Period = { kind: ShareCardModel["kind"]; from: string; to: string; label: string; phrase: string; fileKey: string };

/** 期間内（from〜to、"YYYY-MM-DD"、両端を含む）の日付の有効な記録 */
function recordsIn(records: ReadonlyArray<FuelRecord>, from: string, to: string): FuelRecord[] {
  return records.filter(r => {
    const d = normalizeDateString(r.date);
    return d !== null && d >= from && d <= to;
  });
}

function periodsOf(today: Date): Period[] {
  const monthKey = monthKeyOf(today);
  const [y, m] = monthKey.split("-").map(Number);
  const todayKey = localDateString(today);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (SHARE_FALLBACK_DAYS - 1));
  return [
    { kind: "month", from: `${monthKey}-01`, to: `${monthKey}-31`, label: `${y}年${m}月`, phrase: "今月", fileKey: monthKey },
    {
      kind: "recent",
      from: localDateString(start),
      to: todayKey,
      label: `直近${SHARE_FALLBACK_DAYS}日`,
      phrase: `直近${SHARE_FALLBACK_DAYS}日`,
      fileKey: todayKey,
    },
  ];
}

/** 距離の表示（整数に丸めて桁区切り） */
function formatDistance(km: number): string {
  return Math.round(km).toLocaleString("ja-JP");
}

/**
 * シェアカードのモデル。今月（無ければ直近 30 日）に燃費が出ていなければ null。
 * @param records 選択中の車両の記録（連鎖計算済み。useVehicleScope の records）
 * @param today いまの日時（ローカル暦で期間を決める）
 * @param vehicleName 車両名（null / 空白なら画像に出さない）
 */
export function shareCardModelOf(
  records: ReadonlyArray<FuelRecord>,
  today: Date,
  vehicleName?: string | null
): ShareCardModel | null {
  for (const period of periodsOf(today)) {
    const inPeriod = recordsIn(records, period.from, period.to);
    const efficiency = summarize(inPeriod).avgEfficiency;
    if (efficiency === null || !Number.isFinite(efficiency) || efficiency <= 0) continue;

    let distance = 0;
    let cost = 0;
    let costKnown = false;
    for (const r of inPeriod) {
      if (hasPositiveNumber(r.total_distance)) distance += r.total_distance;
      if (hasNumber(r.total_cost)) {
        cost += r.total_cost;
        costKnown = true;
      }
    }

    const stats: ShareCardStat[] = [{ label: "給油", value: String(inPeriod.length), unit: "回" }];
    if (distance > 0) stats.push({ label: "走行", value: formatDistance(distance), unit: "km" });
    const costText = costKnown ? formatYen(cost) : null;
    if (costText) stats.push({ label: "給油代", value: costText, unit: "" });

    // 目盛りはヒーローと同じく直近の燃費（外れ値を除く）から決め、表示する値は必ず含める
    const newestFirst = [...records]
      .filter(r => normalizeDateString(r.date) !== null)
      .sort((a, b) => (normalizeDateString(b.date) ?? "").localeCompare(normalizeDateString(a.date) ?? ""))
      .map(r => r.fuel_efficiency);
    const scale = gaugeScaleOf([...gaugeBasisOf(newestFirst), efficiency]);
    const name = vehicleName?.trim();

    return {
      kind: period.kind,
      periodLabel: period.label,
      periodPhrase: period.phrase,
      vehicleName: name ? name : null,
      efficiency,
      efficiencyText: efficiency.toFixed(2),
      stats,
      statsLine: stats.map(s => `${s.label} ${s.value}${s.unit === "km" ? ` ${s.unit}` : s.unit}`).join("・"),
      scale,
      fraction: gaugeFraction(efficiency, scale),
      filename: `fuellens-${period.fileKey}.png`,
    };
  }
  return null;
}

/** 共有の文言（例: 「今月の燃費は 62.54 km/L でした #燃費記録 #FuelLens」） */
export function shareTextOf(model: Pick<ShareCardModel, "periodPhrase" | "efficiencyText">): string {
  return `${model.periodPhrase}の燃費は ${model.efficiencyText} km/L でした ${SHARE_HASHTAGS}`;
}

/** X（旧 Twitter）の投稿画面の URL。画像は添付できないので文言と URL だけ */
export function xIntentUrlOf(text: string, url: string = SHARE_URL): string {
  const params = new URLSearchParams({ text, url });
  return `https://twitter.com/intent/tweet?${params.toString()}`;
}

/** シェアのボタンの文言（今月 / 直近 30 日） */
export function shareButtonLabelOf(model: Pick<ShareCardModel, "periodPhrase">): string {
  return `${model.periodPhrase}の燃費をシェア`;
}
