import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DistanceCostTable from "@/app/gas-cost/_components/DistanceCostTable";
import { NATIONAL_GAS_PRICE } from "@/lib/nationalGasPrice";

// 表の見出しは全国平均の単価（週次で自動更新される）。181 円ちょうどでも「181.0」と出す
const label = (grade: string, price: number) => new RegExp(`${grade} ${price.toFixed(1).replace(".", "[.]")} 円/L`);
const REGULAR = label("レギュラー", NATIONAL_GAS_PRICE.regular);
const HIGH_OCTANE = label("ハイオク", NATIONAL_GAS_PRICE.highOctane);

describe("DistanceCostTable", () => {
  it("レギュラーの表を表示し、ハイオクに切り替えられる。行は ?km= で計算機へリンクする", async () => {
    const user = userEvent.setup();
    render(<DistanceCostTable />);
    const regular = screen.getByRole("table", { name: REGULAR });
    expect(regular).toBeVisible();
    expect(screen.getByRole("table", { hidden: true, name: HIGH_OCTANE })).not.toBeVisible();
    expect(screen.getAllByRole("link", { name: /300\s*km/ })[0]).toHaveAttribute("href", "/gas-cost?km=300#gas-cost-calculator");

    await user.click(screen.getByRole("button", { name: "ハイオク" }));
    expect(screen.getByRole("table", { name: HIGH_OCTANE })).toBeVisible();
    expect(screen.getByRole("table", { hidden: true, name: REGULAR })).not.toBeVisible();
  });
});
