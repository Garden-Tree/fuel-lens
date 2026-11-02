import { APP_QR_URL, qrSvgPath } from "@/lib/appQr";

/**
 * 公開ツールページの「アプリを使う」の枠に添える、スマホでアプリを開く QR コード。
 * パソコン（マウスなど細かく指せてホバーできる端末）でだけ見せる。スマホ・タブレットでは CSS で隠す。
 * サーバーで描画する（クライアントの JS は使わない）。
 */
export default function AppQrHandoff() {
  const { size, d } = qrSvgPath(APP_QR_URL);
  return (
    <div className="mt-4 hidden items-center gap-4 rounded-2xl border border-line bg-ground p-3 [@media(hover:hover)_and_(pointer:fine)]:flex">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width={104}
        height={104}
        role="img"
        aria-label={`FuelLens のアプリ（${APP_QR_URL}）を開く QR コード`}
        shapeRendering="crispEdges"
        className="shrink-0 rounded-lg"
      >
        <rect width={size} height={size} fill="#ffffff" />
        <path d={d} fill="#000000" />
      </svg>
      <p className="text-sm leading-6 text-sub">スマホで読み取ると、レシートを撮ってすぐ記録できます</p>
    </div>
  );
}
