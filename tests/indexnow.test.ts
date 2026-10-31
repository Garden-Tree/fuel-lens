import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  INDEXNOW_KEY,
  SITE_ORIGIN,
  buildIndexNowPayload,
  extractSitemapUrls,
  isIndexNowSuccess,
} from "../scripts/indexnow.mjs";

describe("extractSitemapUrls", () => {
  it("自サイトの URL だけを重複なしで取り出す", () => {
    const xml = `<?xml version="1.0"?><urlset>
      <url><loc>${SITE_ORIGIN}/</loc></url>
      <url><loc> ${SITE_ORIGIN}/calc </loc></url>
      <url><loc>${SITE_ORIGIN}/calc</loc></url>
      <url><loc>https://example.com/x</loc></url>
      <url><loc>${SITE_ORIGIN}.evil.example/x</loc></url>
    </urlset>`;
    expect(extractSitemapUrls(xml)).toEqual([`${SITE_ORIGIN}/`, `${SITE_ORIGIN}/calc`]);
  });
});

describe("buildIndexNowPayload", () => {
  it("ホスト・キー・キーの場所・URL 一覧を入れる", () => {
    const p = buildIndexNowPayload([`${SITE_ORIGIN}/`]);
    expect(p).toEqual({
      host: "fuel-lens.gadelog.com",
      key: INDEXNOW_KEY,
      keyLocation: `${SITE_ORIGIN}/${INDEXNOW_KEY}.txt`,
      urlList: [`${SITE_ORIGIN}/`],
    });
  });
});

describe("isIndexNowSuccess", () => {
  it("200 と 202 だけを成功とする", () => {
    expect(isIndexNowSuccess(200)).toBe(true);
    expect(isIndexNowSuccess(202)).toBe(true);
    expect(isIndexNowSuccess(403)).toBe(false);
    expect(isIndexNowSuccess(422)).toBe(false);
  });
});

describe("キーのファイル", () => {
  it("public に置いたファイルの中身がキーと一致する", () => {
    expect(readFileSync(`public/${INDEXNOW_KEY}.txt`, "utf8").trim()).toBe(INDEXNOW_KEY);
  });
});
