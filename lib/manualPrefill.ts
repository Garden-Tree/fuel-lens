/**
 * 手動入力の事前入力（`/app?action=manual&distance=…&amount=…&cost=…`）の URL の組み立てと解析（純粋関数）。
 *
 * - 組み立て: 燃費計算ページ（/calc）の「この内容で FuelLens に記録する」（lib/calcPage.ts の calcRecordHref）。
 *   /calc は静的な公開ページなので、ここは React・Clerk・Supabase に依存しない（lib/recordDraft.ts の数値の読み取りだけ使う）
 * - 解析: /app の useShortcutActions が `?action=manual` を実行するときに読む（lib/scan/useShortcutActions.ts）。
 *   URL は信頼できない入力なので、parseDraftNumber で読み、0 以下・上限超え・長すぎる文字列は捨てる。知らないキーは無視する
 *
 * 保存はしない。値は手動入力フォームの初期値になるだけで、利用者が日付・車両を確認して通常の保存（RecordStore）で保存する。
 * 実行後は useShortcutActions が `router.replace("/app")` でクエリごと消す（再読み込みで開き直さない）。
 * アクセス解析（lib/analytics/scrubUrl.ts は utm_* だけ残す）と Sentry（lib/sentry/scrub.ts はクエリを落とす）には送られない。
 */

import type { DistanceMode, FuelRecord } from "./types";
import { parseDraftNumber } from "./recordDraft";

/** 記録の欄 → URL のキー。distance は区間距離（トリップメーター。total_distance。オドメーターではない） */
export const PREFILL_PARAMS = {
  total_distance: "distance",
  fuel_amount: "amount",
  total_cost: "cost",
} as const;

export type PrefillField = keyof typeof PREFILL_PARAMS;

const FIELDS = Object.keys(PREFILL_PARAMS) as PrefillField[];

/**
 * 受け付ける上限。これを超える値は読み違い・改ざんとみなして捨てる（その欄だけ空にする）。
 * もっともらしさの判定（PLAUSIBILITY_LIMITS）より緩くし、フォームの注意・検証に任せる
 */
export const PREFILL_MAX: Readonly<Record<PrefillField, number>> = {
  total_distance: 100_000,
  fuel_amount: 10_000,
  total_cost: 10_000_000,
};

/** 1 つの値の文字数の上限（数値として妥当な長さを超える文字列は読まない） */
const MAX_RAW_LENGTH = 20;

/** 事前入力する値（区間距離 km・給油量 L・支払総額 円）。読めた欄だけ入る */
export type ManualPrefill = Partial<Record<PrefillField, number>>;

/** 1 つの値を読む。空・数値でない・0 以下・上限超え・長すぎる文字列は null */
export function parsePrefillNumber(raw: string | null | undefined, max: number): number | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_RAW_LENGTH) return null;
  const { value, error } = parseDraftNumber(raw);
  if (error || value === null || !(value > 0) || value > max) return null;
  return value;
}

/** URL の検索パラメータから事前入力の値を読む。1 つも読めなければ null（通常の手動入力と同じ） */
export function parseManualPrefill(params: Pick<URLSearchParams, "get">): ManualPrefill | null {
  const prefill: ManualPrefill = {};
  for (const field of FIELDS) {
    const value = parsePrefillNumber(params.get(PREFILL_PARAMS[field]), PREFILL_MAX[field]);
    if (value !== null) prefill[field] = value;
  }
  return Object.keys(prefill).length > 0 ? prefill : null;
}

/** 手動入力を事前入力つきで開く /app の URL。範囲外・不正な値は載せない（すべて無ければ `/app?action=manual`） */
export function buildManualPrefillHref(prefill: ManualPrefill): string {
  const params = new URLSearchParams({ action: "manual" });
  for (const field of FIELDS) {
    const value = prefill[field];
    if (value == null || !Number.isFinite(value) || value <= 0 || value > PREFILL_MAX[field]) continue;
    const text = String(value);
    // 指数表記（1e-7 など）は parseDraftNumber で読めないので載せない
    if (parsePrefillNumber(text, PREFILL_MAX[field]) === null) continue;
    params.set(PREFILL_PARAMS[field], text);
  }
  return `/app?${params.toString()}`;
}

/** フォームの初期値（useRecordEditing.startManualEntry に渡す） */
export type ManualPrefillRecord = Partial<Pick<FuelRecord, PrefillField>>;

/**
 * 選択中の車両の距離の入力方式に合わせて、フォームに入れる値を決める。
 * - トリップモード: 区間距離（走行距離の欄）・給油量・支払総額をそのまま入れる
 * - オドメーターモード: 区間距離は入れない（distanceOmitted）。この方式のフォームには区間距離の欄が無く、
 *   区間はオドメーターの差分から連鎖計算で導出する（lib/fillChain.ts）ため、入れても表示も保存もされない。
 *   オドメーターは計算ページに無いので、利用者に入力してもらう（新規の手動入力ではオドメーターが必須）
 */
export function prefillToRecord(
  prefill: ManualPrefill,
  mode: DistanceMode
): { record: ManualPrefillRecord; distanceOmitted: boolean } {
  const record: ManualPrefillRecord = {};
  if (prefill.fuel_amount != null) record.fuel_amount = prefill.fuel_amount;
  if (prefill.total_cost != null) record.total_cost = prefill.total_cost;
  const distanceOmitted = mode === "odometer" && prefill.total_distance != null;
  if (mode === "trip" && prefill.total_distance != null) record.total_distance = prefill.total_distance;
  return { record, distanceOmitted };
}

/** 事前入力してフォームを開いたときの案内（toast） */
export function prefillAppliedMessage(vehicleName: string | null | undefined, distanceOmitted: boolean): string {
  const vehicle = vehicleName ? `「${vehicleName}」の` : "";
  if (distanceOmitted) {
    return `計算した内容を${vehicle}手動入力に入れました。この車両はオドメーターで記録するため走行距離は入れていません。オドメーターを入力し、日付を確認して保存してください`;
  }
  return `計算した内容を${vehicle}手動入力に入れました。日付と車両を確認して保存してください`;
}
