import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FuelLens",
    short_name: "FuelLens",
    description: "レシートとトリップメーターの写真から燃費を記録",
    lang: "ja",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#030712",
    theme_color: "#030712",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Web Share Target: ギャラリー等の「共有」から写真を受け取る。
    // POST /share は Service Worker（public/sw.js）が横取りし、画像はサーバーへ送らず端末内で /app のスキャンに渡す。
    // テキストやリンクの共有先には出さないよう、files だけを宣言する（title / text / url は受け取らない）。
    share_target: {
      action: "/share",
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        files: [{ name: "image", accept: ["image/*"] }],
      },
    },
    shortcuts: [
      {
        name: "スキャン",
        url: "/app?action=scan",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "手動で入力",
        url: "/app?action=manual",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
