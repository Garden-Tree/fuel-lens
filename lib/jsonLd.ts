/**
 * JSON-LD（`<script type="application/ld+json">`）に埋め込む文字列を作る。
 * `<` を `<` にして、値に `</script>` が含まれてもスクリプト要素を閉じさせない。
 * JSON としての意味は変わらない（JSON.parse すると元の値に戻る）。
 */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
