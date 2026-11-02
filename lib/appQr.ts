import qrcode from "qrcode-generator";
import { DEFAULT_SITE_URL } from "./siteUrl";

/**
 * パソコンで公開ツールページを見ている人に、スマホでアプリを開いてもらうための QR コード（純粋関数）。
 * サーバーで SVG のパスにして描画する（クライアントの JS は使わない）。
 */

/** QR コードで開く URL。プレビュー環境でも本番のアプリを開く */
export const APP_QR_URL = `${DEFAULT_SITE_URL}/app`;

/** QR コードの周りの余白（モジュール数）。規格の推奨は 4 */
export const QR_QUIET_ZONE = 4;

/**
 * 文字列を QR コード（誤り訂正レベル M・型番は自動）にし、SVG の viewBox の一辺と、黒いモジュールを並べた path の d を返す。
 * 1 モジュール = 1 単位。余白（QR_QUIET_ZONE）を含む
 */
export function qrSvgPath(text: string): { size: number; d: string } {
  const qr = qrcode(0, "M");
  qr.addData(text, "Byte");
  qr.make();
  const count = qr.getModuleCount();
  const parts: string[] = [];
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) parts.push(`M${col + QR_QUIET_ZONE} ${row + QR_QUIET_ZONE}h1v1h-1z`);
    }
  }
  return { size: count + QR_QUIET_ZONE * 2, d: parts.join("") };
}
