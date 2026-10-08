/**
 * 日付・日時の検証と変換（純粋関数。依存のないモジュール）。
 *
 * 記録の date は "YYYY-MM-DD"（ローカル暦の日付）、created_at は ISO 8601 の日時文字列。
 * `new Date("YYYY-MM-DD")` は UTC 0 時に解釈されてローカルの日付とずれるため、日付の比較は文字列で行い、
 * Date が必要なときは parseLocalDate でローカル 0 時の Date を作る。
 */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATE_PREFIX_RE = /^(\d{4})-(\d{2})-(\d{2})/;

/** normalizeTimestamp が受け付ける日時文字列の最大長 */
const MAX_TIMESTAMP_LENGTH = 64;

/** YYYY-MM-DD 形式（前後に余計な文字なし）かつ実在する暦日か */
export function isValidCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const [y, mo, d] = value.split("-").map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

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

/** "YYYY-MM-DD" をローカル 0 時の Date に変換する（不正なら null） */
export function parseLocalDate(date: unknown): Date | null {
  const s = normalizeDateString(date);
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Date をローカル暦の "YYYY-MM-DD" 文字列にする（年は 4 桁にゼロ埋め）。
 * `toISOString()` は UTC に変換されるため、日本時間の深夜などで日付がずれる。
 * 期間フィルタの境界はこの文字列同士の辞書順比較で行う。
 */
export function localDateString(d: Date): string {
  const y = String(d.getFullYear()).padStart(4, "0");
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 今日の日付（ローカル）を YYYY-MM-DD で返す */
export function todayLocalISO(): string {
  return localDateString(new Date());
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

/**
 * 日時文字列を Postgres が必ず受け付ける ISO 8601（UTC, `Z` 付き）へ正規化する。解析できなければ null。
 * JS の Date.parse は "2024" や "1"、タイムゾーンなしの日時など Postgres と解釈が異なる・拒否される
 * 文字列も受け付けるため、ブラウザで一度解釈した結果を toISOString() で確定させてから保存・送信する。
 * 年は 1000〜9999 に限る。
 */
export function normalizeTimestamp(v: unknown): string | null {
  if (typeof v !== "string" || v.length === 0 || v.length > MAX_TIMESTAMP_LENGTH) return null;
  const ms = Date.parse(v);
  if (Number.isNaN(ms)) return null;
  const d = new Date(ms);
  const year = d.getUTCFullYear();
  return year >= 1000 && year <= 9999 ? d.toISOString() : null;
}
