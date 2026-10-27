import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DistanceCostTable from "@/app/gas-cost/_components/DistanceCostTable";

describe("DistanceCostTable", () => {
  it("レギュラーの表を表示し、ハイオクに切り替えられる。行は ?km= で計算機へリンクする", async () => {
    const user = userEvent.setup();
    render(<DistanceCostTable />);
    const regular = screen.getByRole("table", { name: /レギュラー 170 円\/L/ });
    expect(regular).toBeVisible();
    expect(screen.getByRole("table", { hidden: true, name: /ハイオク 181 円\/L/ })).not.toBeVisible();
    expect(screen.getAllByRole("link", { name: /300\s*km/ })[0]).toHaveAttribute("href", "/gas-cost?km=300#gas-cost-calculator");

    await user.click(screen.getByRole("button", { name: "ハイオク" }));
    expect(screen.getByRole("table", { name: /ハイオク 181 円\/L/ })).toBeVisible();
    expect(screen.getByRole("table", { hidden: true, name: /レギュラー 170 円\/L/ })).not.toBeVisible();
  });
});
