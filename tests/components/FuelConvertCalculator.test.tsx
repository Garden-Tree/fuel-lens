import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FuelConvertCalculator from "@/app/fuel-convert/_components/FuelConvertCalculator";

function setup() {
  const user = userEvent.setup();
  render(<FuelConvertCalculator />);
  return {
    user,
    value: screen.getByLabelText("燃費の値") as HTMLInputElement,
    price: screen.getByLabelText("ガソリン単価（任意）") as HTMLInputElement,
  };
}

/** 結果表の行見出し（単位名で始まる <th>）の行 */
function rowOf(unit: string): HTMLElement {
  const th = screen.getAllByRole("rowheader").find((el) => el.textContent?.startsWith(unit));
  if (!th) throw new Error(`row not found: ${unit}`);
  return th.closest("tr") as HTMLElement;
}
const rowValue = (unit: string) => rowOf(unit).querySelector(".num")?.textContent ?? "";

describe("FuelConvertCalculator", () => {
  it("km/L を入れると 4 単位を同時に出し、入力行を強調する", async () => {
    const { user, value } = setup();
    expect(rowValue("km/L")).toBe("--");
    await user.type(value, "15");
    expect(rowValue("km/L")).toBe("15.00");
    expect(rowValue("L/100km")).toBe("6.67");
    expect(rowValue("mpg (US)")).toBe("35.28");
    expect(rowValue("mpg (UK)")).toBe("42.37");
    expect(rowOf("km/L")).toHaveAttribute("data-input-row", "true");
    expect(within(rowOf("km/L")).getByText("入力")).toBeInTheDocument();
  });

  it("入力する単位を切り替えると、その単位から換算する", async () => {
    const { user, value } = setup();
    const button = screen.getByRole("button", { name: "L/100km" });
    await user.click(button);
    expect(button).toHaveAttribute("aria-pressed", "true");
    await user.type(value, "8");
    expect(rowValue("km/L")).toBe("12.50");
    expect(rowValue("L/100km")).toBe("8.00");
    expect(rowOf("L/100km")).toHaveAttribute("data-input-row", "true");
  });

  it("単価を入れたときだけ燃料費を出す", async () => {
    const { user, value, price } = setup();
    await user.type(value, "15");
    expect(screen.queryByText("1kmあたりの燃料費")).not.toBeInTheDocument();
    await user.type(price, "170");
    expect(screen.getByText("1kmあたりの燃料費")).toBeInTheDocument();
    expect(screen.getByText("11.3")).toBeInTheDocument();
    expect(screen.getByText("1,133")).toBeInTheDocument();
  });

  it("不正な入力には日本語のメッセージを出し、リセットで消す", async () => {
    const { user, value } = setup();
    const reset = screen.getByRole("button", { name: "リセット" });
    expect(reset).toBeDisabled();
    await user.type(value, "0");
    expect(screen.getByText("km/Lは 0 より大きい数値で入力してください")).toBeInTheDocument();
    expect(value).toHaveAttribute("aria-invalid", "true");
    await user.click(reset);
    expect(value).toHaveValue("");
    expect(screen.queryByText(/大きい数値/)).not.toBeInTheDocument();
  });
});
