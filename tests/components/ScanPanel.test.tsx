import { describe, expect, it, vi } from "vitest";
import { createRef } from "react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ScanPanel, { type ScanPanelHandle, type ScanPanelProps } from "@/app/app/_components/ScanPanel";
import { renderWithProviders } from "../setup/render";

const PREVIEW = "data:image/jpeg;base64,AAAA";

function setup(overrides: Partial<ScanPanelProps> = {}) {
  const props: ScanPanelProps = {
    dataLoading: false,
    scanning: false,
    loadingStep: null,
    preview: null,
    sharedPending: null,
    vehicleName: "マイカー",
    distanceMode: "trip",
    readOnly: false,
    showSignInHint: false,
    onSelectFile: vi.fn(),
    onClearPreview: vi.fn(),
    onAnalyzeShared: vi.fn(),
    onManualEntry: vi.fn(),
    ...overrides,
  };
  const user = userEvent.setup();
  const view = renderWithProviders(<ScanPanel {...props} />);
  return { user, props, ...view };
}

describe("ScanPanel", () => {
  it("カメラ・アルバム・手動入力のボタンと、対象の車両・ヒントを表示する", () => {
    setup();
    expect(screen.getByRole("heading", { name: "スキャンして記録" })).toBeInTheDocument();
    expect(screen.getByText("対象: マイカー")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "カメラで撮影してスキャン" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "アルバムから選択" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "手動で入力" })).toBeEnabled();
    expect(screen.getByText("画像のペースト（Ctrl+V）にも対応")).toBeInTheDocument();
    expect(screen.getByText("走行距離はトリップメーター（前回給油からの区間距離）を入力してください")).toBeInTheDocument();
    // 非表示のファイル入力（カメラ / アルバム）
    expect(screen.getByLabelText("カメラで撮影")).toHaveAttribute("capture", "environment");
    expect(screen.getByLabelText("画像ファイルを選択")).toHaveAttribute("accept", "image/*");
  });

  it("オドメーターモードではオドメーターを写すよう案内する", () => {
    setup({ distanceMode: "odometer" });
    expect(screen.getByText("メーターはオドメーター（積算距離）が写るように撮影してください")).toBeInTheDocument();
  });

  it("未ログインのヒントは showSignInHint のときだけ表示する", () => {
    const hint = "AIスキャンはログイン後に利用できます。「手動で入力」はログインなしでも使えます。";
    const { rerender, props } = setup();
    expect(screen.queryByText(hint)).not.toBeInTheDocument();
    rerender(<ScanPanel {...props} showSignInHint />);
    expect(screen.getByText(hint)).toBeInTheDocument();
  });

  it("手動で入力を押すと onManualEntry を呼ぶ。閲覧専用・スキャン中は押せない", async () => {
    const { user, props, rerender } = setup();
    await user.click(screen.getByRole("button", { name: "手動で入力" }));
    expect(props.onManualEntry).toHaveBeenCalledTimes(1);

    rerender(<ScanPanel {...props} readOnly />);
    expect(screen.getByRole("button", { name: "手動で入力" })).toBeDisabled();
    rerender(<ScanPanel {...props} scanning loadingStep="compress" />);
    expect(screen.getByRole("button", { name: "手動で入力" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "カメラで撮影してスキャン" })).toBeDisabled();
  });

  it("スキャン中は段階を表示する", () => {
    const { rerender, props } = setup({ scanning: true, loadingStep: "compress" });
    expect(screen.getByText("画像を圧縮中...")).toBeInTheDocument();
    rerender(<ScanPanel {...props} scanning loadingStep="analyze" />);
    expect(screen.getByText("AIが解析中...")).toBeInTheDocument();
  });

  it("画像を選ぶと onSelectFile にファイルを渡す", async () => {
    const { user, props } = setup();
    const file = new File(["x"], "receipt.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText("画像ファイルを選択"), file);
    expect(props.onSelectFile).toHaveBeenCalledWith(file);
  });

  it("プレビュー中は「次を撮る」と閉じるボタンを出し、閉じると onClearPreview を呼ぶ", async () => {
    const { user, props } = setup({ preview: PREVIEW });
    expect(screen.getByRole("img", { name: "Preview" })).toHaveAttribute("src", PREVIEW);
    expect(screen.getByRole("button", { name: /次を撮る/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /読み取る/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "プレビューを閉じる" }));
    expect(props.onClearPreview).toHaveBeenCalledTimes(1);
  });

  it("確認待ちの共有画像があれば「読み取る」「手動で入力」を出し、ハンドラを呼ぶ", async () => {
    const { user, props } = setup({ preview: PREVIEW, sharedPending: PREVIEW });
    await user.click(screen.getByRole("button", { name: /読み取る/ }));
    expect(props.onAnalyzeShared).toHaveBeenCalledWith(PREVIEW);
    await user.click(screen.getByRole("button", { name: /手動で入力/ }));
    expect(props.onManualEntry).toHaveBeenCalledTimes(1);
  });

  it("スキャン中のプレビューには操作ボタンを出さない", () => {
    setup({ preview: PREVIEW, sharedPending: PREVIEW, scanning: true, loadingStep: "analyze" });
    expect(screen.queryByRole("button", { name: "プレビューを閉じる" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /次を撮る/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /読み取る/ })).not.toBeInTheDocument();
  });

  it("読み込み中はスケルトンを表示し、ボタンは出さない", () => {
    setup({ dataLoading: true });
    expect(screen.getByText("対象: 車両")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "カメラで撮影してスキャン" })).not.toBeInTheDocument();
  });

  it("ドラッグ中はドロップ先の案内を表示する", () => {
    setup({ isDragging: true });
    expect(screen.getByText("ここに画像をドロップして解析")).toBeInTheDocument();
  });

  it("openCamera はカメラボタンにフォーカスしてカメラ入力を開く", () => {
    const ref = createRef<ScanPanelHandle>();
    setup({ ref });
    const cameraInput = screen.getByLabelText("カメラで撮影");
    const click = vi.spyOn(cameraInput, "click");
    ref.current?.openCamera();
    expect(click).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "カメラで撮影してスキャン" })).toHaveFocus();
  });

  it("openAlbum はアルバムボタンにフォーカスし、capture なしのファイル入力を開く", () => {
    const ref = createRef<ScanPanelHandle>();
    setup({ ref });
    const albumInput = screen.getByLabelText("画像ファイルを選択");
    const cameraInput = screen.getByLabelText("カメラで撮影");
    expect(albumInput).not.toHaveAttribute("capture");
    const albumClick = vi.spyOn(albumInput, "click");
    const cameraClick = vi.spyOn(cameraInput, "click");
    ref.current?.openAlbum();
    expect(albumClick).toHaveBeenCalledTimes(1);
    expect(cameraClick).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "アルバムから選択" })).toHaveFocus();
  });
});
