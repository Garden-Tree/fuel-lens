/**
 * 公開の計算ツール（/calc・/gas-cost・/annual-gas-cost・/fuel-convert・/warikan）の数値欄の検証。
 * 全角数字・桁区切りの正規化と「数値として読めるか・負数でないか」は lib/recordDraft.ts の parseDraftNumber に任せ、
 * ここでは欄ごとの範囲とエラー文言（「{欄名}は〜で入力してください」）をそろえる。
 * 空欄はエラーにしない（結果が出ないだけ、または既定値を使う）。
 */
import { parseDraftNumber } from "./recordDraft";

export type FieldParse<E extends number | null = null> = { value: number | E; error?: string };

/**
 * 0 より大きい数値の欄（allowZero なら 0 以上）。max を渡すとその値以下に限る。
 * - 空 → value null（エラーなし）
 * - 読めない・負数 → 「{label}は数値で入力してください」
 * - 0 以下（allowZero でないとき） → 「{label}は 0 より大きい数値で入力してください」
 * - max 超え → 「{label}は {max（3 桁区切り）} 以下で入力してください」
 */
export function parsePositiveField(
  label: string,
  raw: string,
  opts: { allowZero?: boolean; max?: number } = {}
): FieldParse {
  const parsed = parseDraftNumber(raw);
  if (parsed.error) return { value: null, error: `${label}は数値で入力してください` };
  if (parsed.value === null) return { value: null };
  if (!opts.allowZero && parsed.value <= 0) {
    return { value: null, error: `${label}は 0 より大きい数値で入力してください` };
  }
  if (opts.max !== undefined && parsed.value > opts.max) {
    return { value: null, error: `${label}は ${opts.max.toLocaleString("ja-JP")} 以下で入力してください` };
  }
  return { value: parsed.value };
}

/**
 * min〜max の整数の欄。空なら opts.empty（既定 null）をエラーなしで返し、範囲外・整数でない・読めないときは
 * opts.empty とエラーを返す。エラー文言の既定は「{label}は {min}〜{max} の整数で入力してください」（3 桁区切り）で、
 * 欄によって言い回しが違うときは opts.message で文全体を渡す。
 */
export function parseIntInRange<E extends number | null = null>(
  label: string,
  raw: string,
  min: number,
  max: number,
  opts: { empty?: E; message?: string } = {}
): FieldParse<E> {
  const empty = (opts.empty === undefined ? null : opts.empty) as E;
  const parsed = parseDraftNumber(raw);
  if (!parsed.error && parsed.value === null) return { value: empty };
  const n = parsed.value;
  if (parsed.error || n === null || !Number.isInteger(n) || n < min || n > max) {
    const message =
      opts.message ?? `${label}は ${min.toLocaleString("ja-JP")}〜${max.toLocaleString("ja-JP")} の整数で入力してください`;
    return { value: empty, error: message };
  }
  return { value: n };
}
