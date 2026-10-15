import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TwoPhotoScanSheet, { type TwoPhotoScanSheetProps } from "@/app/(app)/app/_components/TwoPhotoScanSheet";
import { renderWithProviders } from "../setup/render";

const receiptFile = new File(["receipt"], "receipt.jpg", { type: "image/jpeg" });
const meterFile = new File(["meter"], "meter.jpg", { type: "image/jpeg" });

function setup(overrides: Partial<TwoPhotoScanSheetProps> = {}) {
  const props: TwoPhotoScanSheetProps = {
    onClose: vi.fn(),
    onSubmit: vi.fn(),
    distanceMode: "trip",
    ...overrides,
  };
  const user = userEvent.setup();
  const view = renderWithProviders(<TwoPhotoScanSheet {...props} />);
  return { user, props, ...view };
}

const albumInput = () => screen.getByLabelText("画像ファイルを選択（2枚で読み取る）") as HTMLInputElement;
const cameraInput = () => screen.getByLabelText("カメラで撮影（2枚で読み取る）") as HTMLInputElement;
const submitButton = () => screen.getByRole("button", { name: "2枚を読み取る" });

describe("TwoPhotoScanSheet", () => {
  it("最初はレシートの段階。2枚そろうまで読み取れず、メーターなしの読み取りも出さない", () => {
    setup();
    expect(screen.getByRole("dialog", { name: "レシートとメーターを別々に撮る" })).toBeInTheDocument();
    const receiptSection = screen.getByRole("region", { name: /1\. レシート/ });
    expect(receiptSection).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("region", { name: /2\. メーター/ })).not.toHaveAttribute("aria-current");
    expect(submitButton()).toBeDisabled();
    expect(screen.queryByRole("button", { name: "メーターなしで読み取る" })).not.toBeInTheDocument();
    // 初期フォーカスはレシートの「撮影」
    expect(screen.getByRole("button", { name: "レシートを撮影" })).toHaveFocus();
    // カメラは capture 付き、アルバムは capture なし
    expect(cameraInput()).toHaveAttribute("capture", "environment");
    expect(albumInput()).not.toHaveAttribute("capture");
  });

  it("レシート → メーターの順に選ぶと、サムネイルを出して 2 枚を onSubmit に渡す", async () => {
    const { user, props } = setup();
    const inputClick = vi.spyOn(HTMLInputElement.prototype, "click");

    await user.click(screen.getByRole("button", { name: "レシートをアルバムから選ぶ" }));
    await user.upload(albumInput(), receiptFile);
    expect(await screen.findByRole("img", { name: "レシートの画像" })).toHaveAttribute("src", expect.stringMatching(/^data:/));
    // 次の段階（メーター）へ
    expect(screen.getByRole("region", { name: /2\. メーター/ })).toHaveAttribute("aria-current", "step");
    await waitFor(() => expect(screen.getByRole("button", { name: "メーターを撮影" })).toHaveFocus());
    expect(submitButton()).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "メーターを撮影" }));
    await user.upload(cameraInput(), meterFile);
    expect(await screen.findByRole("img", { name: "メーターの画像" })).toBeInTheDocument();
    expect(submitButton()).toBeEnabled();
    await waitFor(() => expect(submitButton()).toHaveFocus());

    await user.click(submitButton());
    expect(props.onSubmit).toHaveBeenCalledWith(receiptFile, meterFile);
    expect(inputClick).toHaveBeenCalled();
    inputClick.mockRestore();
  });

  it("レシートだけなら「メーターなしで読み取る」で meter = null を渡す", async () => {
    const { user, props } = setup();
    await user.click(screen.getByRole("button", { name: "レシートを撮影" }));
    await user.upload(cameraInput(), receiptFile);
    expect(screen.getByText(/距離は確認画面で入力してください/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "メーターなしで読み取る" }));
    expect(props.onSubmit).toHaveBeenCalledWith(receiptFile, null);
  });

  it("撮り直し・選び直しで差し替え、「入れ替える」で役割を入れ替え、メーターを外せる", async () => {
    const { user, props } = setup({ initialFiles: { receipt: meterFile, meter: receiptFile } });
    // 2 枚そろっていれば「2枚を読み取る」に初期フォーカス
    expect(submitButton()).toHaveFocus();
    expect(screen.getByRole("button", { name: "レシートを撮り直す" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "メーターを選び直す" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "レシートとメーターを入れ替える" }));
    await user.click(submitButton());
    expect(props.onSubmit).toHaveBeenLastCalledWith(receiptFile, meterFile);

    // メーターを選び直す
    const other = new File(["other"], "other.jpg", { type: "image/jpeg" });
    await user.click(screen.getByRole("button", { name: "メーターを選び直す" }));
    await user.upload(albumInput(), other);
    await user.click(submitButton());
    expect(props.onSubmit).toHaveBeenLastCalledWith(receiptFile, other);

    // メーターを外すと、メーターなしの読み取りが選べる
    await user.click(screen.getByRole("button", { name: "メーターの画像を外す" }));
    expect(submitButton()).toBeDisabled();
    expect(screen.queryByRole("button", { name: "レシートとメーターを入れ替える" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "メーターなしで読み取る" })).toBeInTheDocument();
  });

  it("メーターの撮り方の案内は車両の距離の入力方式に合わせる", () => {
    const { rerender, props } = setup({ distanceMode: "odometer" });
    expect(screen.getByText("オドメーター（積算距離）が写るように撮影してください")).toBeInTheDocument();
    rerender(<TwoPhotoScanSheet {...props} distanceMode="trip" />);
    expect(screen.getByText("トリップメーター（前回給油からの区間距離）が写るように撮影してください")).toBeInTheDocument();
  });

  it("× と「キャンセル」で onClose（読み取りはしない）", async () => {
    const { user, props } = setup();
    await user.click(screen.getByRole("button", { name: "閉じる" }));
    await user.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(props.onClose).toHaveBeenCalledTimes(2);
    expect(props.onSubmit).not.toHaveBeenCalled();
  });
});
