import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WarikanCalculator from "@/app/warikan/_components/WarikanCalculator";

describe("WarikanCalculator", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
    vi.restoreAllMocks();
  });

  it("入力すると 1 人あたりを出し、URL のクエリを置き換える（履歴は増やさない）", async () => {
    window.history.replaceState(null, "", "/warikan");
    const user = userEvent.setup();
    const historyLength = window.history.length;
    render(<WarikanCalculator />);
    await user.type(screen.getByLabelText("走行距離"), "150");
    await user.type(screen.getByLabelText("燃費"), "15");
    await user.type(screen.getByLabelText("ガソリン単価"), "170");
    await user.type(screen.getByLabelText("高速代など（任意）"), "4000");
    await user.type(screen.getByLabelText("人数"), "4");
    expect(screen.getByText("1,900")).toBeInTheDocument();
    expect(window.location.search).toBe("?km=150&trip=round&eff=15&price=170&toll=4000&people=4&driver=all&round=100");
    expect(window.history.length).toBe(historyLength);

    await user.click(screen.getByRole("button", { name: "運転手は払わない" }));
    expect(screen.getByText("2,500")).toBeInTheDocument();
    expect(window.location.search).toContain("driver=exclude");
  });

  it("共有リンクで開くと同じ入力と結果を先に出し、「自分で計算し直す」で入力欄へ", async () => {
    window.history.replaceState(null, "", "/warikan?km=150&trip=round&eff=15&price=170&toll=4000&people=4&driver=exclude&round=100");
    const user = userEvent.setup();
    render(<WarikanCalculator />);
    expect(screen.getByText("送られてきた計算結果")).toBeInTheDocument();
    expect(screen.getByText("2,500")).toBeInTheDocument();
    expect(screen.getByLabelText("走行距離")).toHaveValue("150");
    expect(screen.getByRole("button", { name: "運転手は払わない" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "自分で計算し直す" }));
    expect(screen.queryByText("送られてきた計算結果")).not.toBeInTheDocument();
  });

  it("不正なクエリは無視する", () => {
    window.history.replaceState(null, "", "/warikan?km=abc&people=1");
    render(<WarikanCalculator />);
    expect(screen.queryByText("送られてきた計算結果")).not.toBeInTheDocument();
    expect(screen.getByLabelText("走行距離")).toHaveValue("");
  });

  it("LINE の共有リンクとコピー（成功の表示）", async () => {
    window.history.replaceState(null, "", "/warikan?km=150&eff=15&price=170&people=4");
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    render(<WarikanCalculator />);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const line = screen.getByRole("link", { name: "LINE で送る" });
    expect(line.getAttribute("href")).toContain("https://social-plugins.line.me/lineit/share?url=");
    expect(line.getAttribute("href")).toContain(encodeURIComponent("/warikan?km=150"));

    await user.click(screen.getByRole("button", { name: "リンクをコピー" }));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toMatch(/^ガソリン代の割り勘：1人 900円（ガソリン代 3,400円、4人で均等）\nhttp/);
    expect(screen.getByText("コピーしました")).toBeInTheDocument();
  });
});
