import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FuelCalculator from "@/app/calc/_components/FuelCalculator";

function setup() {
  const user = userEvent.setup();
  render(<FuelCalculator />);
  return {
    user,
    distance: screen.getByLabelText("走行距離") as HTMLInputElement,
    amount: screen.getByLabelText("給油量") as HTMLInputElement,
    cost: screen.getByLabelText("支払総額（任意）") as HTMLInputElement,
  };
}

/** 結果の <dt> に対応する <dd> の数値 */
function resultValue(label: string): string {
  const dt = screen.getByText(label, { selector: "dt" });
  return dt.nextElementSibling?.querySelector(".num")?.textContent ?? "";
}

describe("FuelCalculator", () => {
  it("入力に合わせて燃費・単価・1km あたりの燃料費を出す", async () => {
    const { user, distance, amount, cost } = setup();
    expect(resultValue("燃費")).toBe("--");
    expect(distance).toHaveAttribute("inputmode", "decimal");

    await user.type(distance, "400");
    await user.type(amount, "25");
    expect(resultValue("燃費")).toBe("16.00");
    expect(resultValue("単価")).toBe("--");

    await user.type(cost, "4000");
    expect(resultValue("燃費")).toBe("16.00");
    expect(resultValue("単価")).toBe("160.0");
    expect(resultValue("1kmあたりの燃料費")).toBe("10.0");
  });

  it("不正な入力には日本語のメッセージを出す", async () => {
    const { user, distance, amount } = setup();
    await user.type(distance, "abc");
    await user.type(amount, "0");
    expect(screen.getByText("走行距離は数値で入力してください")).toBeInTheDocument();
    expect(screen.getByText("給油量は 0 より大きい数値で入力してください")).toBeInTheDocument();
    expect(distance).toHaveAttribute("aria-invalid", "true");
    expect(resultValue("燃費")).toBe("--");
  });

  it("リセットで入力と結果を消す", async () => {
    const { user, distance, amount, cost } = setup();
    const reset = screen.getByRole("button", { name: "リセット" });
    expect(reset).toBeDisabled();

    await user.type(distance, "400");
    await user.type(amount, "25");
    await user.type(cost, "4000");
    await user.click(reset);

    expect(distance).toHaveValue("");
    expect(amount).toHaveValue("");
    expect(cost).toHaveValue("");
    expect(resultValue("燃費")).toBe("--");
    expect(reset).toBeDisabled();
  });

  it("結果が出たら「この内容で FuelLens に記録する」で手動入力を事前入力つきで開ける", async () => {
    const { user, distance, amount, cost } = setup();
    const name = "この内容で FuelLens に記録する";
    expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();

    await user.type(distance, "400");
    expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();
    await user.type(amount, "25");
    expect(screen.getByRole("link", { name })).toHaveAttribute("href", "/app?action=manual&distance=400&amount=25");

    await user.type(cost, "4000");
    expect(screen.getByRole("link", { name })).toHaveAttribute(
      "href",
      "/app?action=manual&distance=400&amount=25&cost=4000"
    );

    // エラーがあるときは出さない
    await user.type(cost, "x");
    expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();
  });
});
