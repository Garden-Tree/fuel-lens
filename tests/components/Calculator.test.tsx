import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CalculatorField, ResetButton, ResultItem } from "@/components/ui";

describe("CalculatorField", () => {
  it("ラベルで入力欄を引け、補足を aria-describedby でつなぐ", () => {
    const onChange = vi.fn();
    render(<CalculatorField id="f-distance" label="走行距離" unit="km" value="" onChange={onChange} hint="区間距離" />);
    const input = screen.getByLabelText("走行距離");
    expect(input).toHaveAttribute("id", "f-distance");
    expect(input).toHaveAttribute("inputmode", "decimal");
    expect(input).toHaveAttribute("aria-describedby", "f-distance-hint");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input.className).toContain("pr-12");
    expect(screen.getByText("km")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "400" } });
    expect(onChange).toHaveBeenCalledWith("400");
  });

  it("エラーがあれば aria-invalid と赤枠、エラー文の id もつなぐ", () => {
    render(
      <CalculatorField id="f" label="人数" unit="人" value="x" onChange={() => {}} hint="補足" error="人数は数値で入力してください" inputMode="numeric" />
    );
    const input = screen.getByLabelText("人数");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "f-hint f-error");
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input.className).toContain("border-red-500");
    expect(document.getElementById("f-error")).toHaveTextContent("人数は数値で入力してください");
  });

  it("補足が無ければ出さず、エラーだけをつなぐ（どちらも無ければ aria-describedby なし）", () => {
    const { rerender } = render(<CalculatorField id="v" label="燃費の値" unit="km/L" value="" onChange={() => {}} unitSpace="lg" />);
    const input = screen.getByLabelText("燃費の値");
    expect(input).not.toHaveAttribute("aria-describedby");
    expect(document.getElementById("v-hint")).toBeNull();
    expect(input.className).toContain("pr-20");

    rerender(<CalculatorField id="v" label="燃費の値" unit="km/L" value="a" onChange={() => {}} unitSpace="sm" error="エラー" />);
    expect(input).toHaveAttribute("aria-describedby", "v-error");
    expect(input.className).toContain("pr-10");
  });
});

describe("ResultItem", () => {
  it("値があれば tone の色、無ければ薄い「--」", () => {
    const { rerender } = render(
      <dl>
        <ResultItem label="燃費" unit="km/L" value="16.00" tone="text-accent" large />
      </dl>
    );
    const value = screen.getByText("16.00");
    expect(value.className).toContain("text-accent");
    expect(value.className).toContain("text-2xl");
    expect(screen.getByText("燃費", { selector: "dt" })).toBeInTheDocument();

    rerender(
      <dl>
        <ResultItem label="燃費" unit="km/L" value={null} tone="text-accent" />
      </dl>
    );
    const empty = screen.getByText("--");
    expect(empty.className).toContain("text-faint");
    expect(empty.className).toContain("text-xl");
  });
});

describe("ResetButton", () => {
  it("押すと onClick、disabled なら押せない", () => {
    const onClick = vi.fn();
    const { rerender } = render(<ResetButton onClick={onClick} />);
    fireEvent.click(screen.getByRole("button", { name: "リセット" }));
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(<ResetButton onClick={onClick} disabled />);
    expect(screen.getByRole("button", { name: "リセット" })).toBeDisabled();
  });
});
