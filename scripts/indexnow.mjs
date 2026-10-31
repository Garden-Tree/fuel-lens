// IndexNow（Bing・Yahoo! JAPAN・Yandex など）に、本番のサイトマップにある URL を知らせる。
// .github/workflows/indexnow.yml が、Vercel の本番デプロイ成功後に実行する。手動なら:
//   node scripts/indexnow.mjs            # 送信する
//   node scripts/indexnow.mjs --dry-run  # 送る内容を表示するだけ
// キーは公開してよい値（public/<key>.txt で配信し、検索エンジンが所有確認に使う）。秘密ではない。

export const INDEXNOW_KEY = "12d574bf660907ebd21c6ef4ff9ec17e";
export const SITE_ORIGIN = "https://fuel-lens.gadelog.com";
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

/** サイトマップ XML から、指定したオリジンの URL だけを重複なしで取り出す */
export function extractSitemapUrls(xml, origin = SITE_ORIGIN) {
  const urls = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&"));
  return [...new Set(urls.filter((u) => u === origin || u.startsWith(`${origin}/`)))];
}

/** IndexNow の一括送信の本文 */
export function buildIndexNowPayload(urls, origin = SITE_ORIGIN, key = INDEXNOW_KEY) {
  return {
    host: new URL(origin).host,
    key,
    keyLocation: `${origin}/${key}.txt`,
    urlList: urls,
  };
}

/** 200（受け付け）と 202（受け付け・キー確認待ち）だけを成功とみなす */
export function isIndexNowSuccess(status) {
  return status === 200 || status === 202;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const keyRes = await fetch(`${SITE_ORIGIN}/${INDEXNOW_KEY}.txt`);
  const keyBody = (await keyRes.text()).trim();
  if (!keyRes.ok || keyBody !== INDEXNOW_KEY) {
    throw new Error(`key file check failed: HTTP ${keyRes.status}`);
  }
  const sitemapRes = await fetch(`${SITE_ORIGIN}/sitemap.xml`);
  if (!sitemapRes.ok) throw new Error(`sitemap fetch failed: HTTP ${sitemapRes.status}`);
  const urls = extractSitemapUrls(await sitemapRes.text());
  if (urls.length === 0) throw new Error("sitemap has no URLs for this site");
  const payload = buildIndexNowPayload(urls);
  if (dryRun) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  const res = await fetch(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });
  console.log(`IndexNow: HTTP ${res.status} for ${urls.length} URLs`);
  if (!isIndexNowSuccess(res.status)) {
    throw new Error(`IndexNow rejected: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
}

if (process.argv[1]?.endsWith("indexnow.mjs")) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
