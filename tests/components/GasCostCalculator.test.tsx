import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GasCostCalculator from "@/app/gas-cost/_components/GasCostCalculator";

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
  afterEach(() => window.history.replaceState(null, "", "/"));

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
});
