import { describe, expect, it } from "vitest";
import { APP_QR_URL, QR_QUIET_ZONE, qrSvgPath } from "@/lib/appQr";

describe("qrSvgPath", () => {
  it("アプリの URL を QR コードの path にする（余白込みの一辺）", () => {
    expect(APP_QR_URL).toBe("https://fuel-lens.gadelog.com/app");
    const { size, d } = qrSvgPath(APP_QR_URL);
    // 33 文字・誤り訂正 M は型番 3（29 モジュール）
    expect(size).toBe(29 + QR_QUIET_ZONE * 2);
    expect(d.startsWith(`M${QR_QUIET_ZONE} ${QR_QUIET_ZONE}h1v1h-1z`)).toBe(true);
    // 位置検出パターンの左上 7×7 の外周は黒、内側の 1 周は白
    expect(d).toContain(`M${QR_QUIET_ZONE + 6} ${QR_QUIET_ZONE}h1v1h-1z`);
    expect(d).not.toContain(`M${QR_QUIET_ZONE + 1} ${QR_QUIET_ZONE + 1}h1v1h-1z`);
    // 余白には描かない
    expect(d).not.toMatch(/M[0-3] /);
  });

  it("同じ入力なら同じ path（サーバーで描画しても揺れない）", () => {
    expect(qrSvgPath(APP_QR_URL)).toEqual(qrSvgPath(APP_QR_URL));
  });
});
