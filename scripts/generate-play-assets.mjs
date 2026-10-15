// Google Play 掲載用の画像を生成するスクリプト（追加の依存なし。インストール済みの sharp を使用）。
// 再生成: node scripts/generate-play-assets.mjs
// 出力:
//   - public/screenshots/*.png と docs/play-store/screenshots/*.png
//       docs/images/readme/ のスクリーンショット（780x1688）を、画面の地の色（#0B0F14）で左右に余白を足して 9:16 にし、
//       1080x1920 に拡大したもの。Play は「長辺が短辺の 2 倍以内」を求めるが、元の 780x1688 は約 2.16:1 で超えるため。
//       manifest.ts の screenshots（public/screenshots）と Play Console のアップロードで同じ絵を使う。
//   - docs/play-store/app-icon-512.png
//       Play Console の「アプリアイコン」(512x512 PNG)。角丸なし・全面塗り（形は Play 側が切り抜く）。
// フィーチャーグラフィック（docs/play-store/feature-graphic.png）は docs/play-store/feature-graphic.html を
// ヘッドレス Chrome で 1024x500 に描画して作る（docs/play-store/README.md 参照）。
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GROUND = "#0B0F14";
const SHOTS = ["home", "history", "stats"];

const publicDir = path.join(root, "public", "screenshots");
const docsDir = path.join(root, "docs", "play-store");
const docsShots = path.join(docsDir, "screenshots");
await mkdir(publicDir, { recursive: true });
await mkdir(docsShots, { recursive: true });

for (const name of SHOTS) {
  const src = path.join(root, "docs", "images", "readme", `${name}.png`);
  const { width, height } = await sharp(src).metadata();
  // 9:16 にするため、高さに合わせた幅まで左右に余白を足す
  const targetWidth = Math.round((height * 9) / 16);
  const left = Math.floor((targetWidth - width) / 2);
  const right = targetWidth - width - left;
  // sharp は 1 本のパイプライン内では resize のあとに extend するので、余白を足した結果をいったんバッファにしてから拡大する
  const padded = await sharp(src).extend({ left, right, background: GROUND }).png().toBuffer();
  const buf = await sharp(padded)
    .resize(1080, 1920, { kernel: "lanczos3" })
    .flatten({ background: GROUND })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toBuffer();
  await sharp(buf).toFile(path.join(publicDir, `${name}.png`));
  await sharp(buf).toFile(path.join(docsShots, `${name}.png`));
}

// 角丸なし（全面塗り）版。Play が丸や角丸に切り抜く
const svg = (await readFile(path.join(root, "app", "icon.svg"))).toString().replace('rx="14"', 'rx="0"');
await sharp(Buffer.from(svg), { density: 384 }).resize(512, 512).png().toFile(path.join(docsDir, "app-icon-512.png"));

for (const f of [...SHOTS.map((n) => `screenshots/${n}.png`), "app-icon-512.png"]) {
  const m = await sharp(path.join(docsDir, f)).metadata();
  console.log(`docs/play-store/${f}: ${m.width}x${m.height} ${m.format}`);
}
