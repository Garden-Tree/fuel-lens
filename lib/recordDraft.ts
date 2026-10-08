/**
 * 給油記録の入力フォーム（useRecordForm）の純粋なヘルパー: ドラフト（入力中の文字列）の作成・解析・検証、
 * 連鎖計算のプレビュー（previewInChain）の候補の組み立て、保存用オブジェクトの組み立て、表示用の文言。
 * React には依存しない（フックは lib/useRecordForm.ts。互換のためそこからも再エクスポートしている）。
 *
 * 燃費・区間距離（オドメーターモード）は、入力中の記録を連鎖計算に差し込んだ結果（lib/fillChain.ts の previewInChain）を
 * そのまま使う。フォーム側に連鎖の規則（前回のオドメーター・直前の部分給油の合算・同じ日付の中の位置）を複製しない。
 */

import type { DistanceMode, FuelRecord, FuelType, RecordInput, Vehicle } from "./types";
import { calculateFuelMetrics } from "./calculations";
import { todayLocalISO } from "./dates";
import { isTripDistanceWarning, type ScanWarning } from "./analyze";
import {
  MEMO_MAX_LENGTH,
  distanceModeOf,
  isFuelType,
  previewInChain,
  type ChainCandidate,
  type ChainPreview,
} from "./fillChain";

export type NumericDraftField = "fuel_amount" | "total_cost" | "total_distance" | "odometer";
/** 文字列で保持する入力欄 */
export type TextDraftField = NumericDraftField | "date" | "gas_station" | "memo";

export type RecordDraft = Record<TextDraftField, string> & {
  /** 満タン給油か（既定 true）。false は部分給油 */
  is_full: boolean;
  /** 前回の給油を記録し忘れた（既定 false） */
  missed_previous: boolean;
  /** 燃料種別。null は未指定 */
  fuel_type: FuelType | null;
};

export type DraftField = keyof RecordDraft;

export type RecordFormErrors = Partial<Record<DraftField, string>>;

/**
 * フォームの前提となる車両と記録。
 * - vehicle: 記録の車両。distance_mode で入力方式を、default_fuel_type で新規記録の燃料種別の初期値を決める。省略はトリップモード
 * - records: その車両の記録（連鎖計算の対象。年・月フィルタなどをかける前の、useVehicleScope の records）。
 *   燃費・区間距離のプレビューは、入力中の記録をここに差し込んだ連鎖計算の結果（previewInChain）。省略は記録なし
 * - odometerOptional: 新規でもオドメーター未入力の保存を許す（スキャン結果。メーターが写っていない・読めないことがあるため）
 */
export type RecordFormContext = {
  vehicle?: Pick<Vehicle, "distance_mode" | "default_fuel_type"> | null;
  records?: readonly FuelRecord[];
  odometerOptional?: boolean;
};

/** フォームで編集している記録（オドメーター必須の判定と、連鎖の中の位置に使う） */
export type RecordFormTarget = {
  /** 既存の記録の ID。新規（手動入力・スキャン結果）なら null */
  recordId: string | null;
  /** フォームを開いたときの日付（入力中の日付が不正・空の間は、この日付の位置でプレビューする） */
  initialDate: string;
};

/** 記録（の部分オブジェクト）からフォームの対象を作る */
export function formTargetOf(record?: Partial<FuelRecord> | null): RecordFormTarget {
  return {
    recordId: record?.id ? record.id : null,
    initialDate: record?.date ?? "",
  };
}

/** 部分給油のときの燃費欄の説明 */
export const PARTIAL_FILL_EFFICIENCY_NOTE = "次の満タン給油でまとめて計算";
/** 記録漏れのときの燃費欄の説明 */
export const MISSED_PREVIOUS_EFFICIENCY_NOTE = "記録漏れのため、この給油の燃費は計算しません";

/** 燃費のプレビューに部分給油・持ち越し行の分を合算したときの説明 */
export function mergedRunNote(count: number): string {
  return `部分給油・持ち越し ${count} 件分と合算`;
}
/** オドメーターモードで記録漏れのとき、区間距離を計算しない旨 */
export const MISSED_PREVIOUS_DISTANCE_NOTE = "記録漏れのため区間距離は計算しません";
/** オドメーターモードで、直前の記録漏れのために基準（前回のオドメーター）が無いとき */
export const AFTER_MISSED_DISTANCE_NOTE = "記録漏れの直後のため区間は計算できません";

function numberToDraft(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "" : String(value);
}

/**
 * FuelRecord（または解析結果など同じ形の部分オブジェクト）から入力値を作る。
 * 燃料種別: 記録の値（既知の 4 値）を使う。新規の記録（id が無い）で未指定なら、車両の既定の燃料種別を初期値にする。
 */
export function recordToDraft(record?: Partial<FuelRecord> | null, context?: RecordFormContext | null): RecordDraft {
  const recordFuelType = record?.fuel_type;
  const stored = isFuelType(recordFuelType) ? recordFuelType : null;
  const isNew = !record?.id;
  const vehicleDefault = context?.vehicle?.default_fuel_type;
  return {
    date: record?.date ?? "",
    fuel_amount: numberToDraft(record?.fuel_amount),
    total_cost: numberToDraft(record?.total_cost),
    total_distance: numberToDraft(record?.total_distance),
    odometer: numberToDraft(record?.odometer),
    gas_station: record?.gas_station ?? "",
    memo: record?.memo ?? "",
    is_full: record?.is_full !== false,
    missed_previous: record?.missed_previous === true,
    fuel_type: stored ?? (isNew && isFuelType(vehicleDefault) ? vehicleDefault : null),
  };
}

/** 全角数字・全角ピリオド・全角マイナスを半角に正規化し、桁区切りカンマと空白を取り除く */
export function normalizeNumericInput(value: string): string {
  return value
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[．。]/g, ".")
    .replace(/[－ー−]/g, "-")
    .replace(/[,\s]/g, "");
}

export type ParsedNumber = { value: number | null; error?: string };

/**
 * 文字列ドラフトを数値に変換する。
 * - 空文字 → null（未入力）
 * - "4." のような途中入力 → 4（エラーなし）
 * - 数値として読めない / 負数 / 無限大 → エラー
 */
export function parseDraftNumber(raw: string): ParsedNumber {
  const s = normalizeNumericInput(raw);
  if (s === "") return { value: null };
  if (!/^-?\d*\.?\d*$/.test(s) || s === "-" || s === "." || s === "-.") {
    return { value: null, error: "数値を入力してください" };
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return { value: null, error: "数値を入力してください" };
  if (n < 0) return { value: null, error: "0以上の値を入力してください" };
  return { value: n };
}

/** 文字数（コードポイント数。DB の char_length と同じ数え方） */
export function countChars(value: string): number {
  return Array.from(value).length;
}

export type ParsedDraft = {
  date: string;
  fuel_amount: number | null;
  total_cost: number | null;
  /** 区間距離 (km)。トリップモードは入力値、オドメーターモードは連鎖計算の導出値（previewInChain。無ければ null） */
  total_distance: number | null;
  /** オドメーター (km) */
  odometer: number | null;
  gas_station: string | null;
  is_full: boolean;
  missed_previous: boolean;
  fuel_type: FuelType | null;
  /** 前後の空白を除いたメモ。空なら null */
  memo: string | null;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * オドメーターが必須か。オドメーターモードで、手動で新規に記録するとき（記録 ID なし・odometerOptional でない）だけ必須。
 * - 既存の記録の編集: 任意。オドメーター導入前の記録やトリップモードから切り替えた車両の記録を、
 *   オドメーターを調べ直さなくても編集・保存できるようにする（区間距離は null のまま。連鎖計算では持ち越し行）
 * - スキャン結果: 任意（メーターが写っていない・読めないことがある）。未入力なら注意を出して保存を許す
 */
export function odometerRequiredFor(
  context: RecordFormContext | null | undefined,
  target: Pick<RecordFormTarget, "recordId">
): boolean {
  return distanceModeOf(context?.vehicle) === "odometer" && target.recordId === null && context?.odometerOptional !== true;
}

/** オドメーターモードでオドメーターが空のときのエラー文言（必須のとき） */
export const ODOMETER_REQUIRED_MESSAGE = "オドメーターを入力してください";
/** オドメーターモードでオドメーターが空のときの注意（任意のとき。保存はできる） */
export const ODOMETER_OPTIONAL_HINT = "オドメーターを入力すると区間距離を自動計算します";

/** 解析オプション */
export type ParseDraftOptions = {
  /** オドメーターモードでオドメーターを必須にするか（既定 true。フックでは odometerRequiredFor で決める） */
  odometerRequired?: boolean;
  /** 連鎖計算のプレビュー（formPreviewOf）。オドメーターモードの区間距離に使う。省略時、オドメーターモードの区間距離は null */
  preview?: Pick<ChainPreview, "total_distance"> | null;
};

/** ドラフト全体を解析し、数値と検証エラーをまとめて返す（フック外からも使える純粋関数） */
export function parseDraft(
  draft: RecordDraft,
  context?: RecordFormContext | null,
  options?: ParseDraftOptions
): { parsed: ParsedDraft; errors: RecordFormErrors } {
  const mode = distanceModeOf(context?.vehicle);
  const odometerRequired = options?.odometerRequired !== false;
  const errors: RecordFormErrors = {};
  const fuel = parseDraftNumber(draft.fuel_amount);
  const cost = parseDraftNumber(draft.total_cost);
  const dist = parseDraftNumber(draft.total_distance);
  const odo = parseDraftNumber(draft.odometer);
  if (fuel.error) errors.fuel_amount = fuel.error;
  if (cost.error) errors.total_cost = cost.error;
  // 画面に出ていない欄のエラーで保存できなくならないよう、方式ごとに表示する欄だけを検証する
  if (mode === "trip") {
    if (dist.error) errors.total_distance = dist.error;
  } else if (odo.error) {
    errors.odometer = odo.error;
  } else if (odo.value === null && odometerRequired) {
    errors.odometer = ODOMETER_REQUIRED_MESSAGE;
  }

  const date = draft.date.trim();
  if (date === "") {
    // 空のまま保存すると（編集時に）記録の日付が黙って今日に変わってしまうため、必須にする
    errors.date = "日付を入力してください";
  } else if (!DATE_RE.test(date)) {
    errors.date = "日付の形式が正しくありません";
  }

  const memo = draft.memo.trim();
  if (countChars(memo) > MEMO_MAX_LENGTH) {
    errors.memo = `メモは${MEMO_MAX_LENGTH}文字以内で入力してください`;
  }

  const station = draft.gas_station.trim();
  return {
    parsed: {
      date,
      fuel_amount: fuel.value,
      total_cost: cost.value,
      // オドメーターモードは連鎖計算の導出値（記録漏れ・先頭・持ち越し行は null）。トリップモードは入力値のまま
      total_distance: mode === "odometer" ? (options?.preview?.total_distance ?? null) : dist.value,
      odometer: odo.value,
      gas_station: station === "" ? null : station,
      is_full: draft.is_full,
      missed_previous: draft.missed_previous,
      fuel_type: isFuelType(draft.fuel_type) ? draft.fuel_type : null,
      memo: memo === "" ? null : memo,
    },
    errors,
  };
}

/** 連鎖計算に効く入力欄（previewCandidateOf が読む欄） */
export type ChainDraftFields = Pick<
  RecordDraft,
  "date" | "odometer" | "total_distance" | "fuel_amount" | "total_cost" | "is_full" | "missed_previous"
>;

/**
 * 入力中の値から previewInChain の候補を作る。
 * - id: 既存の記録の編集なら記録 ID（連鎖の中でその記録を置き換える）。新規なら付けない
 * - date: 入力中の日付。入力途中・不正・空の間は、開いたときの日付（target.initialDate）の位置でプレビューする
 * - 数値欄: 入力中の値（未入力・不正は null）。トリップモードの区間距離は入力値、オドメーターは同じ日付の中の並び順にも使う
 */
export function previewCandidateOf(draft: ChainDraftFields, target: RecordFormTarget): ChainCandidate {
  const date = draft.date.trim();
  return {
    ...(target.recordId ? { id: target.recordId } : {}),
    date: DATE_RE.test(date) ? date : target.initialDate,
    odometer: parseDraftNumber(draft.odometer).value,
    total_distance: parseDraftNumber(draft.total_distance).value,
    fuel_amount: parseDraftNumber(draft.fuel_amount).value,
    total_cost: parseDraftNumber(draft.total_cost).value,
    is_full: draft.is_full,
    missed_previous: draft.missed_previous,
  };
}

/** フォームのプレビュー: 入力中の記録を context.records に差し込んだ連鎖計算の結果（previewInChain） */
export function formPreviewOf(
  draft: ChainDraftFields,
  context: RecordFormContext | null | undefined,
  target: RecordFormTarget
): ChainPreview {
  return previewInChain(context?.records ?? [], context?.vehicle, previewCandidateOf(draft, target));
}

/** /api/analyze の warnings の要素として正しい形（code と message が文字列）か */
function isScanWarning(w: unknown): w is ScanWarning {
  return (
    !!w &&
    typeof w === "object" &&
    typeof (w as ScanWarning).code === "string" &&
    typeof (w as ScanWarning).message === "string"
  );
}

/**
 * スキャン結果の確認シートに出す注意（/api/analyze の warnings）。code で絞り込む。
 * オドメーターモードの車両では、区間距離（トリップメーター）の読み取り値は保存に使わない（区間はオドメーターの差分）ので、
 * 区間距離に基づく注意（isTripDistanceWarning: DISTANCE_* と、走行距離 ÷ 給油量の EFFICIENCY_TOO_HIGH）は出さない。
 * 形の正しくない要素（code / message が文字列でないもの）は捨てる。
 */
export function visibleScanWarnings(warnings: unknown, mode: DistanceMode): ScanWarning[] {
  if (!Array.isArray(warnings)) return [];
  const list = warnings.filter(isScanWarning);
  return mode === "odometer" ? list.filter((w) => !isTripDistanceWarning(w.code)) : list;
}

/**
 * 既存の記録に「同じ日付・同じ給油量（誤差 0.01 未満）・同じ支払総額（null 同士も一致）」の
 * 記録があれば返す。重複保存の確認に使う。
 */
export function findDuplicateRecord(
  records: readonly FuelRecord[],
  candidate: Pick<RecordInput, "date" | "fuel_amount" | "total_cost">,
  excludeId?: string | null
): FuelRecord | null {
  for (const r of records) {
    if (excludeId && r.id === excludeId) continue;
    if ((r.date ?? "") !== (candidate.date ?? "")) continue;
    const a = r.fuel_amount;
    const b = candidate.fuel_amount;
    const sameAmount = a == null || b == null ? a == null && b == null : Math.abs(a - b) < 0.01;
    if (!sameAmount) continue;
    const sameCost = (r.total_cost ?? null) === (candidate.total_cost ?? null);
    if (!sameCost) continue;
    return r;
  }
  return null;
}

/**
 * 元の記録から引き継ぐ燃費。`null` は「引き継がない（再計算する）」、`{ value }` は保存値（null を含む）をそのまま使う。
 * インポートした記録など、保存値が連鎖計算と食い違うことがある行を、店舗名だけの編集で書き換えないよう、
 * 日付・区間距離・オドメーター・給油量・満タン・記録漏れを編集するまでは元の値を保つ。
 */
export type EfficiencyFallback = { value: number | null } | null;

/** 記録（の部分オブジェクト）から燃費の引き継ぎ値を作る。fuel_efficiency を持たない（新規・スキャン結果）なら引き継がない */
export function efficiencyFallbackOf(record?: Partial<FuelRecord> | null): EfficiencyFallback {
  return record && record.fuel_efficiency !== undefined ? { value: record.fuel_efficiency ?? null } : null;
}

/**
 * 変更したら燃費の引き継ぎを破棄する（燃費の算出元の）入力欄。
 * 日付も含める（連鎖の位置が変わり、オドメーターモードでは前回のオドメーター＝区間距離も変わるため）
 */
export const EFFICIENCY_SOURCE_FIELDS: ReadonlySet<DraftField> = new Set<DraftField>([
  "date",
  "fuel_amount",
  "total_distance",
  "odometer",
  "is_full",
  "missed_previous",
]);

/**
 * 表示・保存する燃費と、合算した部分給油（持ち越し行を含む）の件数。
 * - 部分給油・記録漏れ: null / 0（連鎖計算でも null。引き継ぎ値があっても使わない）
 * - 引き継ぎ値があれば、その値（null を含む） / 0
 * - それ以外はプレビュー（連鎖計算）の燃費。燃費が出たときだけ、run に積み上がっていた件数（preview.runCount）を返す
 */
export function formEfficiencyOf(
  parsed: Pick<ParsedDraft, "is_full" | "missed_previous">,
  fallbackEfficiency: EfficiencyFallback,
  preview: Pick<ChainPreview, "fuel_efficiency" | "runCount">
): { fuel_efficiency: number | null; mergedRunCount: number } {
  if (!parsed.is_full || parsed.missed_previous) return { fuel_efficiency: null, mergedRunCount: 0 };
  if (fallbackEfficiency) return { fuel_efficiency: fallbackEfficiency.value, mergedRunCount: 0 };
  const efficiency = preview.fuel_efficiency;
  return { fuel_efficiency: efficiency, mergedRunCount: efficiency === null ? 0 : preview.runCount };
}

/**
 * ドラフトから保存用オブジェクトを作る（フック外からも使える純粋関数）。
 * - 区間距離: トリップモードは入力値、オドメーターモードは連鎖計算の導出値
 * - 単価: 再計算できなければ fallbackPrice
 * - 燃費: formEfficiencyOf（部分給油・記録漏れは null。引き継ぎ値が無ければ連鎖計算のプレビュー）
 * - メモ: 前後の空白を除き、空なら null
 *
 * @param context 車両と記録（プレビューの連鎖計算に使う）。省略はトリップモード・記録なし
 * @param target 編集中の記録（省略は新規）
 */
export function buildRecordInput(
  draft: RecordDraft,
  fallbackPrice: number | null,
  fallbackEfficiency: EfficiencyFallback,
  context?: RecordFormContext | null,
  target?: RecordFormTarget | null
): RecordInput {
  const preview = formPreviewOf(draft, context, target ?? formTargetOf(null));
  const { parsed: p } = parseDraft(draft, context, { preview });
  const m = calculateFuelMetrics(p.total_distance, p.fuel_amount, p.total_cost);
  return {
    date: p.date || todayLocalISO(),
    total_distance: p.total_distance,
    fuel_amount: p.fuel_amount,
    gas_station: p.gas_station,
    price_per_unit: m.price_per_unit ?? fallbackPrice,
    total_cost: p.total_cost,
    fuel_efficiency: formEfficiencyOf(p, fallbackEfficiency, preview).fuel_efficiency,
    odometer: p.odometer,
    is_full: p.is_full,
    missed_previous: p.missed_previous,
    fuel_type: p.fuel_type,
    memo: p.memo,
  };
}

/**
 * オドメーター未入力の注意（ODOMETER_OPTIONAL_HINT）を出すか。オドメーターモードで、未入力でもエラーにならない
 * （編集・スキャン結果）ときだけ。必須のときはエラー文言（ODOMETER_REQUIRED_MESSAGE）の方を出す
 */
export function odometerHintOf(
  mode: DistanceMode,
  parsed: Pick<ParsedDraft, "odometer">,
  errors: RecordFormErrors
): string | null {
  return mode === "odometer" && parsed.odometer === null && !errors.odometer ? ODOMETER_OPTIONAL_HINT : null;
}

/** 燃費が null になる理由（部分給油・記録漏れ）の短い説明。それ以外は null */
export function efficiencyNoteOf(parsed: Pick<ParsedDraft, "is_full" | "missed_previous">): string | null {
  if (!parsed.is_full) return PARTIAL_FILL_EFFICIENCY_NOTE;
  if (parsed.missed_previous) return MISSED_PREVIOUS_EFFICIENCY_NOTE;
  return null;
}
