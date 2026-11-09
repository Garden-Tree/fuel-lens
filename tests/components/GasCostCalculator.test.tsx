import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GasCostCalculator from "@/app/gas-cost/_components/GasCostCalculator";
import { formatJaDate } from "@/lib/format";
import { NATIONAL_GAS_PRICE } from "@/lib/nationalGasPrice";

function setup() {
  const user = userEvent.setup();
  render(<GasCostCalculator />);
  return {
    user,
    distance: screen.getByLabelText("走行距離") as HTMLInputElement,
    efficiency: screen.getByLabelText("燃費") as HTMLInputElement,
    price: screen.getByLabelText("ガソリン単価") as HTMLInputElement,
    people: screen.getByLabelText("人数（任意）") as HTMLInputElement,
  };
}

/** 結果の <dt> に対応する <dd> の数値 */
function resultValue(label: string): string {
  const dt = screen.getByText(label, { selector: "dt" });
  return dt.nextElementSibling?.querySelector(".num")?.textContent ?? "";
}

describe("GasCostCalculator", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
    delete window.gtag;
  });

  it("?km= が目安表の距離なら距離を入れておく", () => {
    window.history.replaceState(null, "", "/gas-cost?km=180");
    const { distance, efficiency } = setup();
    expect(distance.value).toBe("180");
    expect(efficiency.value).toBe("");
  });

  it("?km= が表にない値・不正な値なら入れない", () => {
    window.history.replaceState(null, "", "/gas-cost?km=abc");
    expect(setup().distance.value).toBe("");
  });

  it("入力に合わせてガソリン代・ガソリン量・1km あたりを出し、往復で 2 倍にする", async () => {
    const { user, distance, efficiency, price } = setup();
    expect(resultValue("ガソリン代")).toBe("--");

    await user.type(distance, "300");
    await user.type(efficiency, "15");
    expect(resultValue("必要なガソリン量")).toBe("20.00");
    expect(resultValue("ガソリン代")).toBe("--");

    await user.type(price, "170");
    expect(resultValue("ガソリン代")).toBe("3,400");
    expect(resultValue("1kmあたりのガソリン代")).toBe("11.3");

    const roundTrip = screen.getByRole("button", { name: "往復" });
    expect(roundTrip).toHaveAttribute("aria-pressed", "false");
    await user.click(roundTrip);
    expect(roundTrip).toHaveAttribute("aria-pressed", "true");
    expect(resultValue("ガソリン代")).toBe("6,800");
    expect(resultValue("必要なガソリン量")).toBe("40.00");
  });

  it("2 人以上で割り勘の 1 人あたりを出す", async () => {
    const { user, distance, efficiency, price, people } = setup();
    await user.type(distance, "300");
    await user.type(efficiency, "15");
    await user.type(price, "170");
    expect(screen.queryByText(/人で割り勘すると/)).not.toBeInTheDocument();
    await user.type(people, "3");
    expect(screen.getByText(/人で割り勘すると/)).toBeInTheDocument();
    expect(screen.getByText("1,134")).toBeInTheDocument();
  });

  it("燃費の欄から燃費計算ツールへリンクする", () => {
    setup();
    expect(screen.getByRole("link", { name: "満タン法の燃費計算ツール" })).toHaveAttribute("href", "/calc");
  });

  it("不正な入力には日本語のメッセージを出し、リセットで消す", async () => {
    const { user, distance, efficiency } = setup();
    const reset = screen.getByRole("button", { name: "リセット" });
    expect(reset).toBeDisabled();

    await user.type(distance, "abc");
    await user.type(efficiency, "0");
    expect(screen.getByText("走行距離は数値で入力してください")).toBeInTheDocument();
    expect(screen.getByText("燃費は 0 より大きい数値で入力してください")).toBeInTheDocument();
    expect(distance).toHaveAttribute("aria-invalid", "true");

    await user.click(reset);
    expect(distance).toHaveValue("");
    expect(efficiency).toHaveValue("");
    expect(screen.queryByText("走行距離は数値で入力してください")).not.toBeInTheDocument();
    expect(reset).toBeDisabled();
  });

  it("全国平均の単価と出典を出し、ボタンで単価の欄に入れる", async () => {
    const { user, distance, efficiency, price } = setup();
    expect(price.value).toBe("");
    // 単価と調査日は全国平均（週次で自動更新される）。金額の期待値も単価から計算する
    const { regular, highOctane, surveyDate } = NATIONAL_GAS_PRICE;
    const yen = (price: number) => Math.round((300 / 13) * price).toLocaleString("ja-JP");
    expect(screen.getByText(new RegExp(`${formatJaDate(surveyDate)}調査`))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "資源エネルギー庁" })).toHaveAttribute(
      "href",
      "https://www.enecho.meti.go.jp/statistics/petroleum_and_lpgas/pl007/results.html"
    );
    await user.click(screen.getByRole("button", { name: "レギュラーを入れる" }));
    expect(price.value).toBe(regular.toFixed(1));
    await user.type(distance, "300");
    await user.type(efficiency, "13");
    expect(resultValue("ガソリン代")).toBe(yen(regular));
    await user.click(screen.getByRole("button", { name: "ハイオクを入れる" }));
    expect(price.value).toBe(highOctane.toFixed(1));
    expect(resultValue("ガソリン代")).toBe(yen(highOctane));
  });

  it("PR は金額まで計算できてから出し、出光でんきのリンクが入るまではインズウェブを出す", async () => {
    const gtag = vi.fn();
    window.gtag = gtag;
    const { user, distance, efficiency, price } = setup();
    expect(screen.queryByText("PR")).not.toBeInTheDocument();
    await user.type(distance, "300");
    await user.type(efficiency, "13");
    expect(screen.queryByText("PR")).not.toBeInTheDocument();
    await user.type(price, "170");
    const link = screen.getByRole("link", { name: "無料で見積もる" });
    expect(link).toHaveAttribute("href", "https://px.a8.net/svt/ejp?a8mat=4BEL1G+2ZRITE+2PS+15OZHU");
    expect(link).toHaveAttribute("rel", "sponsored noopener");
    expect(screen.getByText("PR")).toBeInTheDocument();
    // 値引きの無い提携先なので、値引き額の文は出さない
    expect(screen.queryByText(/お得です/)).not.toBeInTheDocument();
    expect(gtag).toHaveBeenCalledWith("event", "promo_impression", { promo_id: "insweb-car-gas-cost", page: "/gas-cost" });
    await user.click(link);
    expect(gtag).toHaveBeenCalledWith("event", "promo_click", { promo_id: "insweb-car-gas-cost", page: "/gas-cost" });
    // 入力を消すと消える
    await user.clear(distance);
    expect(screen.queryByText("PR")).not.toBeInTheDocument();
  });
});
