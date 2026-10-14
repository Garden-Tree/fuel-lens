/**
 * Vercel Web Analytics に送る URL から、個人に結びつく情報を落とす（純粋関数）。
 * - ハッシュ（#record-<id> など）は送らない
 * - クエリは集客の効果測定に使う utm_source / utm_medium / utm_campaign / utm_content / utm_term だけ残す
 *   （共有トークン ?t= や ?action= などは送らない）
 */
const KEPT_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

/** URL として解釈できなければ null（呼び出し側は元の値を送らない判断ができる） */
export function scrubAnalyticsUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const kept = new URLSearchParams();
  for (const key of KEPT_PARAMS) {
    const value = url.searchParams.get(key);
    if (value) kept.set(key, value.slice(0, 100));
  }
  url.search = kept.toString();
  url.hash = "";
  return url.toString();
}
