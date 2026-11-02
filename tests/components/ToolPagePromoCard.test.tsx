import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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

describe("AppQrHandoff", () => {
  it("アプリの URL を名前に持つ QR コードの画像と案内文を出す", () => {
    render(<AppQrHandoff />);
    const img = screen.getByRole("img", { name: /https:\/\/fuel-lens\.gadelog\.com\/app/ });
    expect(img.tagName.toLowerCase()).toBe("svg");
    expect(img.querySelector("path")?.getAttribute("d")).toMatch(/^M\d+ \d+h1v1h-1z/);
    expect(screen.getByText("スマホで読み取ると、レシートを撮ってすぐ記録できます")).toBeInTheDocument();
  });
});
