import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ctaClickParamsOf, sanitizeEventParams, trackEvent } from "@/lib/analytics/events";
import { gaMeasurementIdOf, initGtag, resetPageViewStateForTest, trackPageView } from "@/lib/analytics/ga";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("trackEvent", () => {
  it("window が無い（SSR）・gtag が無い（GA 無効のビルド）なら何もしない", () => {
    expect(() => trackEvent("share_card", { method: "x" })).not.toThrow();
    vi.stubGlobal("window", {});
    expect(() => trackEvent("share_card", { method: "x" })).not.toThrow();
  });

  it("gtag があれば event として送る", () => {
    const gtag = vi.fn();
    vi.stubGlobal("window", { gtag });
    trackEvent("record_saved", { source: "scan", is_first: true, distance_mode: "trip" });
    expect(gtag).toHaveBeenCalledWith("event", "record_saved", { source: "scan", is_first: true, distance_mode: "trip" });
  });

  it("gtag が投げても呼び出し元には投げない", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("window", {
      gtag: () => {
        throw new Error("boom");
      },
    });
    expect(() => trackEvent("a2hs_prompt", { action: "shown" })).not.toThrow();
    spy.mockRestore();
  });

  it("型で個人情報や自由入力の文字列を渡せない", () => {
    const gtag = vi.fn();
    vi.stubGlobal("window", { gtag });
    // @ts-expect-error メールアドレスなど、定義に無いパラメータは渡せない
    trackEvent("share_card", { method: "x", email: "a@example.com" });
    // @ts-expect-error 列挙値以外は渡せない
    trackEvent("scan_start", { mode: "ホンダ", logged_in: true, trial: false });
    // @ts-expect-error 定義に無いイベントは送れない
    trackEvent("user_profile", { id: "user_123" });
    // 実行時も、列挙値らしくない文字列（メール・日本語）は落とす
    expect(gtag.mock.calls[0][2]).toEqual({ method: "x" });
    expect(gtag.mock.calls[1][2]).toEqual({ logged_in: true, trial: false });
  });
});

describe("sanitizeEventParams", () => {
  it("列挙値・真偽値・有限の数値だけ残す", () => {
    expect(
      sanitizeEventParams({
        a: "insweb-bike",
        b: "/gas-cost",
        c: true,
        d: 3,
        e: "a@example.com",
        f: "マイカー",
        g: "/app?t=secret",
        h: Number.NaN,
        i: { nested: 1 },
        j: null,
        k: "x".repeat(41),
      })
    ).toEqual({ a: "insweb-bike", b: "/gas-cost", c: true, d: 3 });
  });
});

describe("ctaClickParamsOf", () => {
  it("公開ページの既知の位置だけ返す", () => {
    expect(ctaClickParamsOf("/", "hero")).toEqual({ page: "/", position: "hero" });
    expect(ctaClickParamsOf("/calc", "calc_result")).toEqual({ page: "/calc", position: "calc_result" });
    expect(ctaClickParamsOf("/app", "hero")).toBeNull();
    expect(ctaClickParamsOf("/calc", "unknown")).toBeNull();
    expect(ctaClickParamsOf("/calc", null)).toBeNull();
  });
});

describe("gaMeasurementIdOf", () => {
  it("未設定・空・形式違いなら null（GA 無効）", () => {
    expect(gaMeasurementIdOf(undefined)).toBeNull();
    expect(gaMeasurementIdOf("  ")).toBeNull();
    expect(gaMeasurementIdOf("UA-12345-1")).toBeNull();
    expect(gaMeasurementIdOf("G-ABC\"><script>")).toBeNull();
    expect(gaMeasurementIdOf(" G-TEST000000 ")).toBe("G-TEST000000");
  });
});

describe("initGtag / trackPageView", () => {
  beforeEach(() => resetPageViewStateForTest());

  const commandsOf = (dataLayer: unknown[]) => dataLayer.map((args) => Array.from(args as ArrayLike<unknown>));

  it("自動のページビュー・Google シグナル・広告のパーソナライズを切り、URL のクエリとハッシュを落とす", () => {
    const win: { gtag?: (...args: unknown[]) => void; dataLayer?: unknown[] } = {};
    initGtag(
      "G-TEST000000",
      win,
      "https://fuel-lens.gadelog.com/app?action=shared&t=secret#record-1",
      "https://example.com/post?id=1&utm_source=x"
    );
    const config = commandsOf(win.dataLayer!).find((c) => c[0] === "config");
    expect(config).toEqual([
      "config",
      "G-TEST000000",
      {
        send_page_view: false,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
        page_location: "https://fuel-lens.gadelog.com/app",
        page_referrer: "https://example.com/post?utm_source=x",
      },
    ]);
  });

  it("初期化は 1 回だけ", () => {
    const win: { gtag?: (...args: unknown[]) => void; dataLayer?: unknown[] } = {};
    initGtag("G-TEST000000", win, "https://fuel-lens.gadelog.com/", "");
    initGtag("G-TEST000000", win, "https://fuel-lens.gadelog.com/", "");
    expect(commandsOf(win.dataLayer!).filter((c) => c[0] === "config")).toHaveLength(1);
  });

  it("ページビューはクエリ（utm_* 以外）とハッシュを落とし、同じ URL では送り直さない。referrer は直前のページ", () => {
    const gtag = vi.fn();
    const win = { gtag };
    trackPageView(win, "https://fuel-lens.gadelog.com/?utm_campaign=a", "");
    trackPageView(win, "https://fuel-lens.gadelog.com/?utm_campaign=a#demo", "");
    trackPageView(win, "https://fuel-lens.gadelog.com/history#record-abc", "");
    const views = gtag.mock.calls.filter((c) => c[0] === "event");
    expect(views).toEqual([
      ["event", "page_view", { page_location: "https://fuel-lens.gadelog.com/?utm_campaign=a", page_referrer: "" }],
      [
        "event",
        "page_view",
        { page_location: "https://fuel-lens.gadelog.com/history", page_referrer: "https://fuel-lens.gadelog.com/?utm_campaign=a" },
      ],
    ]);
    // 以後のイベントにも同じ page_location が付くよう set している
    expect(gtag).toHaveBeenCalledWith("set", expect.objectContaining({ page_location: "https://fuel-lens.gadelog.com/history" }));
  });

  it("gtag が無ければ何もしない", () => {
    expect(() => trackPageView({}, "https://fuel-lens.gadelog.com/", "")).not.toThrow();
  });
});
