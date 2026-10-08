import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ManageVehiclesModal from "@/components/ManageVehiclesModal";
import type { Vehicle } from "@/lib/types";
import { renderWithProviders } from "../setup/render";

const CAR: Vehicle = { id: "v1", user_id: "u1", name: "プリウス", type: "car", created_at: "2024-01-01T00:00:00Z" };
const BIKE: Vehicle = {
  id: "v2",
  user_id: "u1",
  name: "カブ",
  type: "bike",
  created_at: "2024-02-01T00:00:00Z",
  distance_mode: "odometer",
  default_fuel_type: "regular",
};

function setup(overrides: Partial<React.ComponentProps<typeof ManageVehiclesModal>> = {}) {
  const props = {
    isOpen: true,
    onClose: vi.fn(),
    vehicles: [CAR, BIKE],
    onAdd: vi.fn().mockResolvedValue({ ...CAR, id: "v3", name: "新車" }),
    onDelete: vi.fn().mockResolvedValue(undefined),
    onUpdate: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  const user = userEvent.setup();
  renderWithProviders(<ManageVehiclesModal {...props} />);
  return { user, ...props };
}

describe("ManageVehiclesModal", () => {
  it("isOpen=false では描画しない", () => {
    setup({ isOpen: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("車両を一覧表示し、距離の入力方式と既定の燃料種別を添える", () => {
    setup();
    expect(screen.getByRole("dialog", { name: "車両の管理" })).toBeInTheDocument();
    expect(screen.getByText("登録済みの車両 (2)")).toBeInTheDocument();
    expect(screen.getByText("プリウス")).toBeInTheDocument();
    expect(screen.getByText("カブ")).toBeInTheDocument();
    expect(screen.getByText("トリップメーター", { selector: "span.block" })).toBeInTheDocument();
    expect(screen.getByText("オドメーター・レギュラー")).toBeInTheDocument();
  });

  it("閉じるボタンに初期フォーカスし、× で onClose が呼ばれる", async () => {
    const { user, onClose } = setup();
    expect(screen.getByRole("button", { name: "閉じる" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "閉じる" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe("追加", () => {
    it("名前が空の間は「追加」を押せない", () => {
      setup();
      expect(screen.getByRole("button", { name: "追加" })).toBeDisabled();
    });

    it("名前・タイプ・方式・燃料種別を onAdd に渡し、成功したらフォームを空に戻す", async () => {
      const { user, onAdd } = setup();
      const nameInput = screen.getByLabelText("新しい車両・バイクの追加");
      await user.type(nameInput, "  サブカー ");
      await user.click(screen.getByRole("radio", { name: "バイク" }));
      await user.click(screen.getByRole("radio", { name: /オドメーター/ }));
      await user.selectOptions(screen.getByLabelText("既定の燃料種別"), "diesel");
      await user.click(screen.getByRole("button", { name: "追加" }));

      expect(onAdd).toHaveBeenCalledWith("サブカー", "bike", { distance_mode: "odometer", default_fuel_type: "diesel" });
      expect(await screen.findByText("車両を追加しました")).toBeInTheDocument();
      expect(nameInput).toHaveValue("");
      expect(screen.getByRole("radio", { name: "自動車" })).toHaveAttribute("aria-checked", "true");
      expect(screen.getByLabelText("既定の燃料種別")).toHaveValue("");
    });

    it("onAdd が失敗したらエラーを表示し、入力を残す", async () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { user } = setup({ onAdd: vi.fn().mockRejectedValue(new Error("登録に失敗しました")) });
      const nameInput = screen.getByLabelText("新しい車両・バイクの追加");
      await user.type(nameInput, "サブ");
      await user.click(screen.getByRole("button", { name: "追加" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("登録に失敗しました");
      expect(nameInput).toHaveValue("サブ");
      spy.mockRestore();
    });
  });

  describe("編集", () => {
    it("編集を始めると現在の値が入り、保存で onUpdate が呼ばれる", async () => {
      const { user, onUpdate } = setup();
      await user.click(screen.getByRole("button", { name: "「カブ」を編集" }));

      const nameInput = screen.getByLabelText("車両の名前");
      expect(nameInput).toHaveValue("カブ");
      await user.clear(nameInput);
      await user.type(nameInput, " スーパーカブ ");
      await user.click(screen.getByRole("button", { name: "保存" }));

      expect(onUpdate).toHaveBeenCalledWith("v2", "スーパーカブ", "bike", {
        distance_mode: "odometer",
        default_fuel_type: "regular",
      });
      expect(await screen.findByText("車両を更新しました")).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByLabelText("車両の名前")).not.toBeInTheDocument());
    });

    it("名前が空なら「保存」を押せない", async () => {
      const { user } = setup();
      await user.click(screen.getByRole("button", { name: "「プリウス」を編集" }));
      await user.clear(screen.getByLabelText("車両の名前"));
      expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
    });

    it("方式を切り替えると注意文が出て、元に戻すと消える", async () => {
      const { user } = setup();
      await user.click(screen.getByRole("button", { name: "「プリウス」を編集" }));

      // 編集行の方式ボタンは一覧側が先（追加フォームより前）
      const [editOdometer, editTrip] = [
        screen.getAllByRole("radio", { name: /オドメーター/ })[0],
        screen.getAllByRole("radio", { name: /トリップメーター/ })[0],
      ];
      await user.click(editOdometer);
      expect(screen.getByText(/区間距離と燃費が「不明」になります/)).toBeInTheDocument();
      await user.click(editTrip);
      expect(screen.queryByText(/区間距離と燃費が「不明」になります/)).not.toBeInTheDocument();
    });

    it("オドメーター → トリップへ切り替える注意文を出す", async () => {
      const { user } = setup();
      await user.click(screen.getByRole("button", { name: "「カブ」を編集" }));
      await user.click(screen.getAllByRole("radio", { name: /トリップメーター/ })[0]);
      expect(screen.getByText(/トリップメーター方式に切り替えると/)).toBeInTheDocument();
    });

    it("Escape: 1 回目は編集だけを取り消し、2 回目でモーダルを閉じる", async () => {
      const { user, onClose } = setup();
      await user.click(screen.getByRole("button", { name: "「プリウス」を編集" }));
      expect(screen.getByLabelText("車両の名前")).toBeInTheDocument();

      await user.keyboard("{Escape}");
      expect(screen.queryByLabelText("車両の名前")).not.toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();

      await user.keyboard("{Escape}");
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("キャンセルで編集を終え、再度開いたときは元の値から始まる", async () => {
      const { user } = setup();
      await user.click(screen.getByRole("button", { name: "「プリウス」を編集" }));
      await user.type(screen.getByLabelText("車両の名前"), "改");
      await user.click(screen.getByRole("button", { name: "キャンセル" }));

      await user.click(screen.getByRole("button", { name: "「プリウス」を編集" }));
      expect(screen.getByLabelText("車両の名前")).toHaveValue("プリウス");
    });

    it("保存中は Escape でも閉じない", async () => {
      let resolveUpdate: () => void = () => {};
      const onUpdate = vi.fn().mockReturnValue(new Promise<void>((r) => (resolveUpdate = r)));
      const { user, onClose } = setup({ onUpdate });
      await user.click(screen.getByRole("button", { name: "「プリウス」を編集" }));
      await user.click(screen.getByRole("button", { name: "保存" }));

      await user.keyboard("{Escape}");
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "閉じる" })).toBeDisabled();

      resolveUpdate();
      expect(await screen.findByText("車両を更新しました")).toBeInTheDocument();
    });
  });

  describe("削除", () => {
    it("既定車両（先頭）の確認文には未分類の記録も削除される旨を含める", async () => {
      const { user, onDelete } = setup();
      await user.click(screen.getByRole("button", { name: "「プリウス」を削除" }));

      const confirmDialog = await screen.findByRole("dialog", { name: "車両の削除" });
      expect(confirmDialog).toHaveTextContent(
        "「プリウス」を削除しますか？ （関連する給油記録と、この車両に表示されている未分類の記録も削除されます）",
      );
      await user.click(screen.getByRole("button", { name: "キャンセル" }));
      expect(onDelete).not.toHaveBeenCalled();
    });

    it("既定車両以外の確認文は関連する給油記録のみ", async () => {
      const { user } = setup();
      await user.click(screen.getByRole("button", { name: "「カブ」を削除" }));

      const confirmDialog = await screen.findByRole("dialog", { name: "車両の削除" });
      expect(confirmDialog).toHaveTextContent("「カブ」を削除しますか？ （関連する給油記録も削除されます）");
      expect(confirmDialog).not.toHaveTextContent("未分類");
    });

    it("確認すると onDelete が呼ばれ、削除しましたと通知する", async () => {
      const { user, onDelete } = setup();
      await user.click(screen.getByRole("button", { name: "「カブ」を削除" }));
      await user.click(await screen.findByRole("button", { name: "削除する" }));

      await waitFor(() => expect(onDelete).toHaveBeenCalledWith("v2"));
      expect(await screen.findByText("「カブ」を削除しました")).toBeInTheDocument();
    });

    it("確認ダイアログの表示中は Escape でモーダルごと閉じない", async () => {
      const { user, onClose, onDelete } = setup();
      await user.click(screen.getByRole("button", { name: "「カブ」を削除" }));
      await screen.findByRole("dialog", { name: "車両の削除" });

      fireEvent.keyDown(window, { key: "Escape" });
      await waitFor(() => expect(screen.queryByRole("dialog", { name: "車両の削除" })).not.toBeInTheDocument());
      expect(onClose).not.toHaveBeenCalled();
      expect(onDelete).not.toHaveBeenCalled();
    });

    it("車両が 1 台だけなら削除ボタンは無効", () => {
      setup({ vehicles: [CAR] });
      const del = screen.getByRole("button", { name: "「プリウス」を削除" });
      expect(del).toBeDisabled();
      expect(del).toHaveAttribute("title", "最低1台の車両は残す必要があります");
    });
  });

  describe("閲覧専用", () => {
    it("案内を出し、追加・編集・削除を無効にする", () => {
      setup({ readOnly: true });
      expect(screen.getByText(/閲覧専用（クラウド接続待ち）/)).toBeInTheDocument();
      expect(screen.getByLabelText("新しい車両・バイクの追加")).toBeDisabled();
      expect(screen.getByRole("button", { name: "追加" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "「プリウス」を編集" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "「プリウス」を削除" })).toBeDisabled();
    });
  });
});
