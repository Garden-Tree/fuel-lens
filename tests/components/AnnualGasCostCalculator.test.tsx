import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AnnualGasCostCalculator from "@/app/annual-gas-cost/_components/AnnualGasCostCalculator";

function setup() {
  const user = userEvent.setup();
  render(<AnnualGasCostCalculator />);
  return { user };
}

/** 結果の <dt> に対応する <dd> の数値 */
function resultValue(label: string): string {
  const dt = screen.getByText(label, { selector: "dt" });
  return dt.nextElementSibling?.querySelector(".num")?.textContent ?? "";
}

describe("AnnualGasCostCalculator", () => {
  it("距離から: 月の距離で月額・年額などを出し、年に切り替えると 12 で割る", async () => {
    const { user } = setup();
    expect(resultValue("1か月のガソリン代")).toBe("--");

    await user.type(screen.getByLabelText("走行距離"), "800");
    await user.type(screen.getByLabelText("燃費"), "15");
    await user.type(screen.getByLabelText("ガソリン単価"), "170");
    expect(resultValue("1か月のガソリン代")).toBe("9,067");
    expect(resultValue("1年のガソリン代")).toBe("108,800");
    expect(resultValue("月間の走行距離")).toBe("800");
    expect(resultValue("年間の走行距離")).toBe("9,600");
    expect(resultValue("月間の給油量")).toBe("53.33");
    expect(resultValue("1kmあたりのガソリン代")).toBe("11.3");

    const year = screen.getByRole("button", { name: "年" });
    await user.click(year);
    expect(year).toHaveAttribute("aria-pressed", "true");
    expect(resultValue("年間の走行距離")).toBe("800");
    expect(resultValue("月間の走行距離")).toBe("66.7");
  });

  it("通勤から: 片道 × 2 × 日数で計算する（日数の既定は 20）", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "通勤から" }));
    expect(screen.queryByLabelText("走行距離")).not.toBeInTheDocument();
    expect(screen.getByLabelText("月の出勤日数")).toHaveValue("20");

    await user.type(screen.getByLabelText("片道の距離"), "15");
    await user.type(screen.getByLabelText("燃費"), "15");
    await user.type(screen.getByLabelText("ガソリン単価"), "170");
    expect(resultValue("1か月のガソリン代")).toBe("6,800");
    expect(resultValue("1年のガソリン代")).toBe("81,600");
    expect(resultValue("月間の走行距離")).toBe("600");

    const days = screen.getByLabelText("月の出勤日数");
    await user.clear(days);
    await user.type(days, "40");
    expect(screen.getByText("出勤日数は 1〜31 の整数で入力してください")).toBeInTheDocument();
    expect(resultValue("1か月のガソリン代")).toBe("--");
  });

  it("不正な入力には日本語のメッセージを出し、リセットで消す", async () => {
    const { user } = setup();
    const reset = screen.getByRole("button", { name: "リセット" });
    expect(reset).toBeDisabled();
    const distance = screen.getByLabelText("走行距離");
    await user.type(distance, "abc");
    await user.type(screen.getByLabelText("燃費"), "0");
    expect(screen.getByText("走行距離は数値で入力してください")).toBeInTheDocument();
    expect(screen.getByText("燃費は 0 より大きい数値で入力してください")).toBeInTheDocument();
    await user.click(reset);
    expect(distance).toHaveValue("");
    expect(screen.queryByText("走行距離は数値で入力してください")).not.toBeInTheDocument();
    expect(reset).toBeDisabled();
  });

  it("単価が範囲外なら注意を出す", async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText("ガソリン単価"), "17");
    expect(screen.getByText(/50〜400 円\/L の範囲外/)).toBeInTheDocument();
  });

  describe("PR 枠", () => {
    afterEach(() => {
      delete window.gtag;
    });

    it("結果が出ていない・エラーのときは出さない", async () => {
      const { user } = setup();
      expect(screen.queryByText("PR")).not.toBeInTheDocument();
      await user.type(screen.getByLabelText("走行距離"), "abc");
      expect(screen.queryByText("PR")).not.toBeInTheDocument();
    });

    it("月間距離が 500 km 以下ならエンキロ、超えたらインズウェブに切り替わり、そのつど表示を送る", async () => {
      const gtag = vi.fn();
      window.gtag = gtag;
      const { user } = setup();
      const distance = screen.getByLabelText("走行距離");
      await user.type(distance, "500");
      expect(screen.getByRole("link", { name: "エンキロの詳細を見る" })).toBeInTheDocument();
      expect(gtag).toHaveBeenCalledWith("event", "promo_impression", { promo_id: "enkiro", page: "/annual-gas-cost" });

      await user.type(distance, "1");
      expect(screen.queryByRole("link", { name: "エンキロの詳細を見る" })).not.toBeInTheDocument();
      const insweb = screen.getByRole("link", { name: "無料で見積もる" });
      expect(insweb).toHaveAttribute("rel", "sponsored noopener");
      expect(gtag).toHaveBeenCalledWith("event", "promo_impression", { promo_id: "insweb-car-annual", page: "/annual-gas-cost" });

      await user.clear(distance);
      expect(screen.queryByText("PR")).not.toBeInTheDocument();
    });

    it("通勤モードは計算後の月間距離で決める（片道 15 km × 2 × 20 日 = 600 km）", async () => {
      const { user } = setup();
      await user.click(screen.getByRole("button", { name: "通勤から" }));
      await user.type(screen.getByLabelText("片道の距離"), "15");
      expect(screen.getByRole("link", { name: "無料で見積もる" })).toBeInTheDocument();
      await user.clear(screen.getByLabelText("片道の距離"));
      await user.type(screen.getByLabelText("片道の距離"), "10");
      expect(screen.getByRole("link", { name: "エンキロの詳細を見る" })).toBeInTheDocument();
    });
  });
});
