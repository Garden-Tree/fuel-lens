// iOS の PWA 用の起動画像（apple-touch-startup-image）の一覧。
// 端末の一覧は lib/startupImages.json が正本で、scripts/generate-startup-images.mjs（画像の生成）と
// app/layout.tsx（metadata.appleWebApp.startupImage）の両方が同じ JSON を読む。縦向きのみ（manifest は portrait 固定）。
import devices from "./startupImages.json";

export type StartupDevice = {
  /** 端末名（説明用） */
  name: string;
  /** CSS px の幅（device-width） */
  width: number;
  /** CSS px の高さ（device-height） */
  height: number;
  /** -webkit-device-pixel-ratio */
  dpr: number;
};

export const STARTUP_DEVICES: readonly StartupDevice[] = devices;

/** 起動画像のファイル名（物理ピクセル）。例: apple-splash-1179x2556.png */
export function startupImageFileName(d: StartupDevice): string {
  return `apple-splash-${d.width * d.dpr}x${d.height * d.dpr}.png`;
}

/** 端末に一致する media クエリ */
export function startupImageMedia(d: StartupDevice): string {
  return `screen and (device-width: ${d.width}px) and (device-height: ${d.height}px) and (-webkit-device-pixel-ratio: ${d.dpr}) and (orientation: portrait)`;
}

/** metadata.appleWebApp.startupImage に渡す { url, media } の一覧 */
export function startupImages(): { url: string; media: string }[] {
  return STARTUP_DEVICES.map((d) => ({ url: `/splash/${startupImageFileName(d)}`, media: startupImageMedia(d) }));
}
