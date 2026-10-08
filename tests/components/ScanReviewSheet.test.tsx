import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ScanReviewSheet from "@/components/ScanReviewSheet";
import type { AnalyzeSuccessResponse } from "@/lib/analyze";
import { renderWithProviders } from "../setup/render";

function makeResult(overrides: Partial<AnalyzeSuccessResponse> = {}): AnalyzeSuccessResponse {
  return {
    date: "2025-01-05",
    fuel_amount: 10,
    total_cost: 1600,
    price_per_unit: 160,
    total_distance: 150,
    odometer: null,
    gas_station: "ENEOS",
    fuel_type: null,
    // トリップメーターの区間距離だけ確信度が低い
    confidence: { date: 0.95, fuel_amount: 0.95, total_cost: 0.95, total_distance: 0.3, gas_station: 0.9 },
    requestId: "req-test",
    ...overrides,
  };
}

function setup(overrides: Partial<AnalyzeSuccessResponse> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onDiscard = vi.fn();
  const user = userEvent.setup();
  renderWithProviders(
    <ScanReviewSheet result={makeResult(overrides)} imageSrc={null} onSave={onSave} onDiscard={onDiscard} />
  );
  return { user, onSave, onDiscard };
}

describe("ScanReviewSheet", () => {
  it("読み取り結果をフォームに流し込み、確信度が低い項目だけ「要確認」にする", () => {
    setup();
    expect(screen.getByRole("dialog", { name: "読み取り結果の確認" })).toBeInTheDocument();
    expect(screen.getByLabelText("給油量 (L)")).toHaveValue("10");
    expect(screen.getByLabelText("支払総額 (円)")).toHaveValue("1600");
    expect(screen.getByLabelText(/走行距離/)).toHaveValue("150");
    expect(screen.getByLabelText("ガソリンスタンド名")).toHaveValue("ENEOS");

    // 見出し文の「要確認」（括弧付き）とは別に、フィールドのバッジは 1 つだけ
    const badges = screen.getAllByText("要確認");
    expect(badges).toHaveLength(1);
    expect(badges[0].closest("label")).toHaveTextContent("走行距離");
  });

  it("読み取れなかった項目（null）も「要確認」になる", () => {
    setup({ gas_station: null });
    const labels = screen.getAllByText("要確認").map((el) => el.closest("label")?.textContent ?? "");
    expect(labels.some((t) => t.includes("ガソリンスタンド名"))).toBe(true);
    expect(labels.some((t) => t.includes("走行距離"))).toBe(true);
  });

  it("保存で、入力した値を含む記録が onSave に渡される", async () => {
    const { user, onSave, onDiscard } = setup();
    await user.clear(screen.getByLabelText("給油量 (L)"));
    await user.type(screen.getByLabelText("給油量 (L)"), "12.5");

    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        date: "2025-01-05",
        fuel_amount: 12.5,
        total_cost: 1600,
        total_distance: 150,
        gas_station: "ENEOS",
        is_full: true,
      })
    );
    expect(onDiscard).not.toHaveBeenCalled();
  });

  it("給油量・支払総額が両方とも無いと保存できない", () => {
    setup({ fuel_amount: null, total_cost: null, price_per_unit: null });
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  });

  it("破棄ボタンで onDiscard が呼ばれる", async () => {
    const { user, onSave, onDiscard } = setup();
    await user.click(screen.getByRole("button", { name: "破棄" }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("Escape で onDiscard が呼ばれる", async () => {
    const { user, onDiscard } = setup();
    await user.keyboard("{Escape}");
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });
});
