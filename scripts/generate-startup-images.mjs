// iOS の PWA 用の起動画像（apple-touch-startup-image）を生成するスクリプト（追加の依存なし。インストール済みの sharp を使用）。
// 再生成: node scripts/generate-startup-images.mjs
// 端末の一覧は lib/startupImages.json（app/layout.tsx の metadata と共有。lib/startupImages.ts 参照）。
// 背景 #0B0F14（manifest の背景色）のキャンバス中央に、短辺の約 28% の幅で public/icons/icon-512.png を置き、
// public/splash/apple-splash-<幅>x<高さ>.png（物理ピクセル）に書き出す。Vercel では実行しないので、生成物はコミットする。
import { readFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GROUND = "#0B0F14";
const ICON_RATIO = 0.28;

const devices = JSON.parse(await readFile(path.join(root, "lib", "startupImages.json"), "utf8"));
const iconSrc = path.join(root, "public", "icons", "icon-512.png");
const outDir = path.join(root, "public", "splash");
await mkdir(outDir, { recursive: true });

let total = 0;
for (const d of devices) {
  const width = d.width * d.dpr;
  const height = d.height * d.dpr;
  const iconSize = Math.round(Math.min(width, height) * ICON_RATIO);
  const icon = await sharp(iconSrc).resize(iconSize, iconSize, { kernel: "lanczos3" }).png().toBuffer();
  const file = path.join(outDir, `apple-splash-${width}x${height}.png`);
  await sharp({ create: { width, height, channels: 3, background: GROUND } })
    .composite([{ input: icon, left: Math.round((width - iconSize) / 2), top: Math.round((height - iconSize) / 2) }])
    .flatten({ background: GROUND })
    .removeAlpha()
    .png({ compressionLevel: 9, palette: true })
    .toFile(file);
  const { size } = await stat(file);
  total += size;
  console.log(`public/splash/${path.basename(file)}: ${(size / 1024).toFixed(1)}KB（${d.name}）`);
}
console.log(`合計: ${(total / 1024).toFixed(1)}KB（${devices.length} 枚）`);
