import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/siteUrl";

// 個人データの画面と API は検索結果に出さない（/app は入口なので許可）
export default function robots(): MetadataRoute.Robots {
  const base = getSiteUrl();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/settings", "/history", "/stats"],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
