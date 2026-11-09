import { describe, expect, it } from "vitest";
import { jsonLdString } from "../lib/jsonLd";

describe("jsonLdString", () => {
  it("< をエスケープして </script> で要素を閉じさせない", () => {
    const out = jsonLdString({ name: "</script><b>" });
    expect(out).not.toContain("<");
    expect(out).toBe('{"name":"\\u003c/script>\\u003cb>"}');
  });

  it("JSON.parse すると元の値に戻る", () => {
    const data = { "@type": "FAQPage", text: "a < b & c > d", list: [1, "2"] };
    expect(JSON.parse(jsonLdString(data))).toEqual(data);
  });
});
