import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import ToolPagePromoCard from "@/components/ToolPagePromoCard";
import AppQrHandoff from "@/components/AppQrHandoff";
import { TOOL_PAGE_PROMOS } from "@/lib/promo/toolPage";

const idemitsu = TOOL_PAGE_PROMOS.find((p) => p.id === "idemitsu-denki")!;
const withLink = { ...idemitsu, href: "https://px.a8.net/svt/ejp?a8mat=TEST" };

describe("ToolPagePromoCard", () => {
  afterEach(() => {
    delete window.gtag;
  });

  it("リンクが無ければ何も出さず、イベントも送らない", () => {
    const gtag = vi.fn();
    window.gtag = gtag;
    const { container } = render(<ToolPagePromoCard promo={idemitsu} page="/gas-cost" liters={20} />);
    expect(container).toBeEmptyDOMElement();
    expect(gtag).not.toHaveBeenCalled();
    expect(render(<ToolPagePromoCard promo={null} page="/gas-cost" liters={20} />).container).toBeEmptyDOMElement();
  });

  it("リンクがあれば PR ラベル・開示文・sponsored のリンクと値引き額を出し、表示とクリックを送る", () => {
    const gtag = vi.fn();
    window.gtag = gtag;
    render(<ToolPagePromoCard promo={withLink} page="/gas-cost" liters={23.08} />);
    expect(screen.getByText("PR")).toBeInTheDocument();
    expect(screen.getByText(/報酬を受け取ることがあります/)).toBeInTheDocument();
    expect(screen.getByText("この計算の給油量なら約46円お得です。")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: idemitsu.cta });
    expect(link).toHaveAttribute("href", withLink.href);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toBe("sponsored noopener");
    expect(gtag).toHaveBeenCalledWith("event", "promo_impression", { promo_id: "idemitsu-denki", page: "/gas-cost" });

    fireEvent.click(link);
    expect(gtag).toHaveBeenCalledWith("event", "promo_click", { promo_id: "idemitsu-denki", page: "/gas-cost" });
  });

  it("給油量が出ていなければ値引き額の文は出さない", () => {
    render(<ToolPagePromoCard promo={withLink} page="/gas-cost" liters={null} />);
    expect(screen.getByText("PR")).toBeInTheDocument();
    expect(screen.queryByText(/この計算の給油量なら/)).not.toBeInTheDocument();
  });
});

describe("ToolPagePromoCard（promo_impression の送り方）", () => {
  type Callback = (entries: Array<Pick<IntersectionObserverEntry, "isIntersecting" | "intersectionRatio">>) => void;
  let observers: Array<{ callback: Callback; observed: Element[]; disconnected: boolean }>;

  beforeEach(() => {
    observers = [];
    class IntersectionObserverMock {
      private entry: { callback: Callback; observed: Element[]; disconnected: boolean };
      constructor(callback: Callback) {
        this.entry = { callback, observed: [], disconnected: false };
        observers.push(this.entry);
      }
      observe(el: Element) {
        this.entry.observed.push(el);
      }
      unobserve() {}
      disconnect() {
        this.entry.disconnected = true;
      }
    }
    vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete window.gtag;
  });

  /** 生きている観測者に交差を知らせる */
  const intersect = (ratio: number) =>
    act(() => {
      for (const o of observers.filter((x) => !x.disconnected)) {
        o.callback([{ isIntersecting: ratio > 0, intersectionRatio: ratio }]);
      }
    });
  const impressions = (gtag: ReturnType<typeof vi.fn>) =>
    gtag.mock.calls.filter((c) => c[1] === "promo_impression");

  it("半分以上見えるまでは送らず、見えたら 1 回だけ送る", () => {
    const gtag = vi.fn();
    window.gtag = gtag;
    render(<ToolPagePromoCard promo={withLink} page="/expense" liters={null} />);
    expect(impressions(gtag)).toHaveLength(0);
    intersect(0.2);
    expect(impressions(gtag)).toHaveLength(0);
    intersect(0.6);
    intersect(1);
    expect(impressions(gtag)).toEqual([["event", "promo_impression", { promo_id: "idemitsu-denki", page: "/expense" }]]);
  });

  it("結果が無効 → 有効と切り替わっても、同じ提携先はマウント中に 1 回だけ送る", () => {
    const gtag = vi.fn();
    window.gtag = gtag;
    const { rerender } = render(<ToolPagePromoCard promo={withLink} page="/gas-cost" liters={20} />);
    intersect(1);
    rerender(<ToolPagePromoCard promo={null} page="/gas-cost" liters={null} />);
    rerender(<ToolPagePromoCard promo={withLink} page="/gas-cost" liters={30} />);
    intersect(1);
    expect(impressions(gtag)).toHaveLength(1);
  });

  it("別の提携先に切り替わったら、その提携先の分を見えたときに 1 回送る", () => {
    const gtag = vi.fn();
    window.gtag = gtag;
    const enkiro = TOOL_PAGE_PROMOS.find((p) => p.id === "enkiro")!;
    const { rerender } = render(<ToolPagePromoCard promo={withLink} page="/annual-gas-cost" liters={20} />);
    intersect(1);
    rerender(<ToolPagePromoCard promo={enkiro} page="/annual-gas-cost" liters={20} />);
    intersect(1);
    rerender(<ToolPagePromoCard promo={withLink} page="/annual-gas-cost" liters={20} />);
    intersect(1);
    expect(impressions(gtag).map((c) => (c[2] as { promo_id: string }).promo_id)).toEqual(["idemitsu-denki", "enkiro"]);
  });
});

describe("ToolPagePromoCard（値引きの無い提携先）", () => {
  const enkiro = TOOL_PAGE_PROMOS.find((p) => p.id === "enkiro")!;

  afterEach(() => {
    delete window.gtag;
  });

  it("給油量が出ていても値引き文は出さず、PR・開示文・sponsored のリンクと page 付きのイベントを出す", () => {
    const gtag = vi.fn();
    window.gtag = gtag;
    render(<ToolPagePromoCard promo={enkiro} page="/annual-gas-cost" liters={50} />);
    expect(screen.getByText("PR")).toBeInTheDocument();
    expect(screen.queryByText(/お得です/)).not.toBeInTheDocument();
    expect(screen.getByText(/報酬を受け取ることがあります/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "エンキロの詳細を見る" });
    expect(link).toHaveAttribute("href", enkiro.href);
    expect(link.getAttribute("rel")).toBe("sponsored noopener");
    expect(gtag).toHaveBeenCalledWith("event", "promo_impression", { promo_id: "enkiro", page: "/annual-gas-cost" });
    fireEvent.click(link);
    expect(gtag).toHaveBeenCalledWith("event", "promo_click", { promo_id: "enkiro", page: "/annual-gas-cost" });
  });
});

describe("AppQrHandoff", () => {
  it("アプリの URL を名前に持つ QR コードの画像と案内文を出す", () => {
    render(<AppQrHandoff />);
    const img = screen.getByRole("img", { name: /https:\/\/fuel-lens\.gadelog\.com\/app/ });
    expect(img.tagName.toLowerCase()).toBe("svg");
    expect(img.querySelector("path")?.getAttribute("d")).toMatch(/^M\d+ \d+h1v1h-1z/);
    expect(screen.getByText("スマホで読み取ると、レシートを撮ってすぐ記録できます")).toBeInTheDocument();
  });
});
