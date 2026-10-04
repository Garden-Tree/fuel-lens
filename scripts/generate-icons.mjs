// PWA アイコン生成スクリプト（追加の依存なし。インストール済みの sharp を使用）。
// 再生成: node scripts/generate-icons.mjs
// 入力: app/icon.svg  出力: public/icons/*.png と public/apple-touch-icon.png
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BG = "#030712";

const svg = await readFile(path.join(root, "app", "icon.svg"));
// 角丸なし（全面塗り）版: maskable / apple-touch-icon 用。OS 側が形状を切り抜く。
const fullBleed = Buffer.from(svg.toString().replace('rx="14"', 'rx="0"'));

await mkdir(path.join(root, "public", "icons"), { recursive: true });

/** 角丸の通常アイコン（purpose: any） */
async function anyIcon(size, out) {
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(out);
}

/** 全面塗り + 余白付き（maskable）。padRatio は片側の余白の割合 */
async function paddedIcon(size, padRatio, out) {
  const inner = Math.round(size * (1 - padRatio * 2));
  const art = await sharp(fullBleed, { density: 384 }).resize(inner, inner).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: art, gravity: "center" }])
    .flatten({ background: BG })
    .removeAlpha()
    .png()
    .toFile(out);
}

const icons = path.join(root, "public", "icons");
await anyIcon(192, path.join(icons, "icon-192.png"));
await anyIcon(512, path.join(icons, "icon-512.png"));
// 安全領域のため片側 10%（合計約 20%）の余白
await paddedIcon(512, 0.1, path.join(icons, "icon-maskable-512.png"));
// iOS は透過を黒で塗るため不透明な全面塗りにする
await sharp(fullBleed, { density: 384 })
  .resize(180, 180)
  .flatten({ background: BG })
  .removeAlpha()
  .png()
  .toFile(path.join(root, "public", "apple-touch-icon.png"));

for (const f of ["icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "apple-touch-icon.png"]) {
  const m = await sharp(path.join(root, "public", f)).metadata();
  console.log(`${f}: ${m.width}x${m.height} ${m.format} alpha=${m.hasAlpha}`);
}
