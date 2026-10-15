import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    // id は start_url と同じ値を明示する（省略時の既定値と同じなので、インストール済みの端末の識別は変わらない）。
    // Google Play の TWA（Trusted Web Activity。PWABuilder が生成）が参照する。docs/play-store/README.md
    id: "/app",
    name: "FuelLens",
    short_name: "FuelLens",
    description: "レシートとトリップメーターの写真から燃費を記録",
    lang: "ja",
    dir: "ltr",
    categories: ["utilities", "lifestyle"],
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0B0F14",
    theme_color: "#0B0F14",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // インストール画面（Chrome のリッチなインストール UI）と Play の TWA 生成で使うスクリーンショット。
    // 実体は scripts/generate-play-assets.mjs が docs/images/readme/ から作る 1080x1920（9:16）の PNG。
    screenshots: [
      { src: "/screenshots/home.png", sizes: "1080x1920", type: "image/png", form_factor: "narrow", label: "ホーム: 前回の燃費と今月の給油" },
      { src: "/screenshots/history.png", sizes: "1080x1920", type: "image/png", form_factor: "narrow", label: "履歴: 給油ごとの燃費" },
      { src: "/screenshots/stats.png", sizes: "1080x1920", type: "image/png", form_factor: "narrow", label: "統計: 燃費と費用の推移" },
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
