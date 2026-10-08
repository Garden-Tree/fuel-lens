import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EditFuelRecordForm from "@/components/EditFuelRecordForm";
import { MEMO_MAX_LENGTH } from "@/lib/fillChain";
import { PARTIAL_FILL_EFFICIENCY_NOTE, useRecordForm } from "@/lib/useRecordForm";
import { renderWithProviders } from "../setup/render";

/** useRecordForm() の結果をそのままフォームに渡す最小のハーネス（手動入力の新規記録と同じ構成） */
function Harness({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  const form = useRecordForm({ date: "2025-01-05" });
  return (
    <EditFuelRecordForm
      form={form}
      onSave={onSave}
      onCancel={onCancel}
      canSave={form.hasCoreValue}
      saveHint="保存するには給油量または支払総額を入力してください"
    />
  );
}

function setup() {
  const onSave = vi.fn();
  const onCancel = vi.fn();
  const user = userEvent.setup();
  renderWithProviders(<Harness onSave={onSave} onCancel={onCancel} />);
  return { user, onSave, onCancel };
}

const fuelInput = () => screen.getByLabelText("給油量 (L)");
const costInput = () => screen.getByLabelText("支払総額 (円)");
const distanceInput = () => screen.getByLabelText(/走行距離/);
const saveButton = () => screen.getByRole("button", { name: "保存" });
const SAVE_HINT = "保存するには給油量または支払総額を入力してください";

describe("EditFuelRecordForm", () => {
  it("給油量は小数の途中入力（4. や 4.78）を保ったまま入力できる", async () => {
    const { user } = setup();
    await user.type(fuelInput(), "4.");
    expect(fuelInput()).toHaveValue("4.");
    await user.type(fuelInput(), "78");
    expect(fuelInput()).toHaveValue("4.78");
  });

  it("給油量・支払総額・走行距離を入れると燃費がライブ表示される", async () => {
    const { user } = setup();
    expect(screen.getByText("--.--")).toBeInTheDocument();

    await user.type(fuelInput(), "30");
    await user.type(costInput(), "4800");
    await user.type(distanceInput(), "450");

    // 450 km ÷ 30 L = 15.00 km/L
    expect(screen.getByText("15.00")).toBeInTheDocument();
    expect(screen.queryByText("--.--")).not.toBeInTheDocument();
    // 単価は 4800 ÷ 30 = 160 円/L（読み取り専用欄）
    expect(screen.getByLabelText(/単価/)).toHaveValue("160.0");
  });

  it("給油量か支払総額が入るまで保存できない", async () => {
    const { user, onSave } = setup();
    expect(saveButton()).toBeDisabled();
    expect(screen.getByText(SAVE_HINT)).toBeInTheDocument();

    await user.type(costInput(), "5000");
    expect(saveButton()).toBeEnabled();
    expect(screen.queryByText(SAVE_HINT)).not.toBeInTheDocument();

    await user.click(saveButton());
    expect(onSave).toHaveBeenCalledTimes(1);

    await user.clear(costInput());
    expect(saveButton()).toBeDisabled();

    await user.type(fuelInput(), "30");
    expect(saveButton()).toBeEnabled();
  });

  it("キャンセルで onCancel が呼ばれる", async () => {
    const { user, onCancel } = setup();
    await user.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("満タンを外すと部分給油の説明（次の満タン給油でまとめて計算）が出る", async () => {
    const { user } = setup();
    const toggle = screen.getByRole("button", { name: "満タン給油" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("満タンまで給油した")).toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-pressed", "false");
    // トグルの説明文と、燃費欄の注記の 2 か所に出る
    expect(screen.getAllByText(new RegExp(PARTIAL_FILL_EFFICIENCY_NOTE))).toHaveLength(2);
    expect(screen.getByText(`（${PARTIAL_FILL_EFFICIENCY_NOTE}）`)).toBeInTheDocument();
    expect(screen.queryByText("満タンまで給油した")).not.toBeInTheDocument();
  });

  it("詳細を開いてメモを入力すると文字数カウンタが増える", async () => {
    const { user } = setup();
    const toggle = screen.getByRole("button", { name: /詳細/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByLabelText(/メモ/)).not.toBeVisible();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(`0/${MEMO_MAX_LENGTH}`)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/メモ/), "メモ123");
    expect(screen.getByLabelText(/メモ/)).toHaveValue("メモ123");
    expect(screen.getByText(`5/${MEMO_MAX_LENGTH}`)).toBeInTheDocument();
  });
});
