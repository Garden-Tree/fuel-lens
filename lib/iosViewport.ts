/**
 * iOS の入力欄フォーカス時の自動ズーム対策（純粋関数）。
 *
 * iOS Safari / Chrome(iOS) は、フォントサイズが 16px 未満の入力欄にフォーカスするとページを拡大する。
 * 拡大中は `position: fixed` の要素（下部タブバー）がレイアウトビューポートに固定され、
 * ページと一緒にスクロールして見える。`maximum-scale=1` を足すと iOS 10 以降は自動ズームだけが止まり、
 * ピンチズームは使えるままなので、アクセシビリティは保たれる。Android では足さない（ピンチズームを塞ぐため）。
 */

export function isIosDevice(userAgent: string, platform: string, maxTouchPoints: number): boolean {
  if (/iPad|iPhone|iPod/.test(userAgent)) return true;
  // iPadOS 13 以降は Mac を名乗るので、タッチ対応の MacIntel を iPad とみなす
  return platform === "MacIntel" && maxTouchPoints > 1;
}

/** viewport の content に `maximum-scale=1` を足す。既にあれば（値が何であれ）そのまま返す（冪等） */
export function withMaxScaleOne(content: string): string {
  if (/(^|[,\s])maximum-scale\s*=/.test(content)) return content;
  const trimmed = content.trim().replace(/,\s*$/, "");
  return trimmed ? `${trimmed}, maximum-scale=1` : "maximum-scale=1";
}

/** iOS のときだけ更新後の content を返す。iOS でなければ null（何もしない） */
export function nextViewportContent(
  content: string,
  env: { userAgent: string; platform: string; maxTouchPoints: number },
): string | null {
  if (!isIosDevice(env.userAgent, env.platform, env.maxTouchPoints)) return null;
  return withMaxScaleOne(content);
}
