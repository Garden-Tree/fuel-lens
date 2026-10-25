import { describe, expect, it, vi } from "vitest";
import { createRef } from "react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ScanPanel, { type ScanPanelHandle, type ScanPanelProps } from "@/app/(app)/app/_components/ScanPanel";
import ScanEntryList, { type ScanEntryListProps } from "@/app/(app)/app/_components/ScanEntryList";
import { renderWithProviders } from "../setup/render";
import { scanAccessOf } from "@/lib/trial";

const PREVIEW = "data:image/jpeg;base64,AAAA";

function setup(overrides: Partial<ScanPanelProps> = {}) {
  const props: ScanPanelProps = {
    scanning: false,
    loadingStep: null,
    preview: null,
    sharedPending: null,
    readOnly: false,
    onSelectFile: vi.fn(),
    onClearPreview: vi.fn(),
    onAnalyzeShared: vi.fn(),
    onManualEntry: vi.fn(),
    onCancelScan: vi.fn(),
    ...overrides,
  };
  const user = userEvent.setup();
  const view = renderWithProviders(<ScanPanel {...props} />);
  return { user, props, ...view };
}

describe("ScanPanel", () => {
  it("待機中は状態カードを出さず、非表示のファイル入力（カメラ / アルバム）だけを置く", () => {
    setup();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByLabelText("カメラで撮影")).toHaveAttribute("capture", "environment");
    expect(screen.getByLabelText("画像ファイルを選択")).toHaveAttribute("accept", "image/*");
    expect(screen.getByLabelText("画像ファイルを選択")).not.toHaveAttribute("capture");
  });

  it("スキャン中は段階を表示し、キャンセルで onCancelScan を呼ぶ", async () => {
    const { rerender, props, user } = setup({ scanning: true, loadingStep: "compress" });
    expect(screen.getByRole("status")).toHaveTextContent("画像を圧縮中...");
    rerender(<ScanPanel {...props} scanning loadingStep="analyze" preview={PREVIEW} />);
    expect(screen.getByText("AIが解析中...")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "読み取る画像のプレビュー" })).toHaveAttribute("src", PREVIEW);
    await user.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(props.onCancelScan).toHaveBeenCalledTimes(1);
  });

  it("onCancelScan が無ければキャンセルを出さない", () => {
    setup({ scanning: true, loadingStep: "analyze", onCancelScan: undefined });
    expect(screen.queryByRole("button", { name: "キャンセル" })).not.toBeInTheDocument();
  });

  it("画像を選ぶと onSelectFile にファイルを渡す", async () => {
    const { user, props } = setup();
    const file = new File(["x"], "receipt.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText("画像ファイルを選択"), file);
    expect(props.onSelectFile).toHaveBeenCalledWith(file);
  });

  it("プレビュー中は「次を撮る」「手動で入力」と閉じるボタンを出し、閉じると onClearPreview を呼ぶ", async () => {
    const { user, props } = setup({ preview: PREVIEW });
    expect(screen.getByRole("img", { name: "読み取る画像のプレビュー" })).toHaveAttribute("src", PREVIEW);
    expect(screen.getByRole("button", { name: /次を撮る/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /読み取る/ })).not.toBeInTheDocument();

    // 読み取りに失敗したあと（プレビューは残る）も手入力に切り替えられる
    await user.click(screen.getByRole("button", { name: /手動で入力/ }));
    expect(props.onManualEntry).toHaveBeenCalledTimes(1);

    const click = vi.spyOn(screen.getByLabelText("カメラで撮影"), "click");
    await user.click(screen.getByRole("button", { name: /次を撮る/ }));
    expect(click).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "プレビューを閉じる" }));
    expect(props.onClearPreview).toHaveBeenCalledTimes(1);
  });

  it("確認待ちの共有画像があれば「読み取る」「手動で入力」を出し、ハンドラを呼ぶ。閲覧専用では手動入力を押せない", async () => {
    const { user, props, rerender } = setup({ preview: PREVIEW, sharedPending: PREVIEW });
    expect(screen.getByText("共有された画像")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /読み取る/ }));
    expect(props.onAnalyzeShared).toHaveBeenCalledWith(PREVIEW);
    await user.click(screen.getByRole("button", { name: /手動で入力/ }));
    expect(props.onManualEntry).toHaveBeenCalledTimes(1);
    rerender(<ScanPanel {...props} readOnly />);
    expect(screen.getByRole("button", { name: /手動で入力/ })).toBeDisabled();
  });

  it("スキャン中のプレビューには操作ボタンを出さない", () => {
    setup({ preview: PREVIEW, sharedPending: PREVIEW, scanning: true, loadingStep: "analyze" });
    expect(screen.queryByRole("button", { name: "プレビューを閉じる" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /次を撮る/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /読み取る/ })).not.toBeInTheDocument();
  });

  it("openCamera はカメラ入力を、openAlbum は capture なしの入力を開く", () => {
    const ref = createRef<ScanPanelHandle>();
    setup({ ref });
    const albumInput = screen.getByLabelText("画像ファイルを選択");
    const cameraInput = screen.getByLabelText("カメラで撮影");
    const albumClick = vi.spyOn(albumInput, "click");
    const cameraClick = vi.spyOn(cameraInput, "click");
    ref.current?.openCamera();
    expect(cameraClick).toHaveBeenCalledTimes(1);
    expect(albumClick).not.toHaveBeenCalled();
    ref.current?.openAlbum();
    expect(albumClick).toHaveBeenCalledTimes(1);
    expect(cameraClick).toHaveBeenCalledTimes(1);
  });
});

describe("ScanPanel（2 枚で読み取る）", () => {
  it("解析中・プレビューでレシートとメーターのサムネイルを並べる", () => {
    const meter = "data:image/jpeg;base64,BBBB";
    const { rerender, props } = setup({ scanning: true, loadingStep: "analyze", preview: PREVIEW, previewMeter: meter });
    expect(screen.getByRole("img", { name: "読み取るレシートのプレビュー" })).toHaveAttribute("src", PREVIEW);
    expect(screen.getByRole("img", { name: "読み取るメーターのプレビュー" })).toHaveAttribute("src", meter);
    rerender(<ScanPanel {...props} scanning={false} loadingStep={null} preview={PREVIEW} previewMeter={meter} />);
    expect(screen.getByRole("img", { name: "読み取るメーターのプレビュー" })).toBeInTheDocument();
    rerender(<ScanPanel {...props} scanning={false} loadingStep={null} preview={PREVIEW} previewMeter={null} />);
    expect(screen.queryByRole("img", { name: "読み取るメーターのプレビュー" })).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "読み取る画像のプレビュー" })).toBeInTheDocument();
  });
});

describe("ScanEntryList", () => {
  function setupList(overrides: Partial<ScanEntryListProps> = {}) {
    const props: ScanEntryListProps = {
      onCamera: vi.fn(),
      onAlbum: vi.fn(),
      onPair: vi.fn(),
      onManual: vi.fn(),
      access: scanAccessOf(false, { enabled: false, remaining: 0 }),
      scanning: false,
      readOnly: false,
      distanceMode: "trip",
      ...overrides,
    };
    const user = userEvent.setup();
    const view = renderWithProviders(<ScanEntryList {...props} />);
    return { user, props, ...view };
  }

  it("撮影する / アルバムから選ぶ / 手動で入力 のハンドラを呼ぶ", async () => {
    const { user, props } = setupList();
    await user.click(screen.getByRole("button", { name: /撮影する/ }));
    await user.click(screen.getByRole("button", { name: /アルバムから選ぶ/ }));
    await user.click(screen.getByRole("button", { name: /レシートとメーターを別々に撮る/ }));
    await user.click(screen.getByRole("button", { name: /手動で入力/ }));
    expect(props.onCamera).toHaveBeenCalledTimes(1);
    expect(props.onAlbum).toHaveBeenCalledTimes(1);
    expect(props.onPair).toHaveBeenCalledTimes(1);
    expect(props.onManual).toHaveBeenCalledTimes(1);
    expect(screen.getByText("メーターはトリップメーター（前回給油からの区間距離）が写るように撮影してください")).toBeInTheDocument();
  });

  it("未ログインでお試しが無効なら撮影・アルバムを無効にして案内を出す（手動入力は使える）", () => {
    setupList({ access: scanAccessOf(true, { enabled: false, remaining: 0 }) });
    expect(screen.getByRole("button", { name: /撮影する/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /アルバムから選ぶ/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /レシートとメーターを別々に撮る/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /手動で入力/ })).toBeEnabled();
    expect(screen.getByText("AIスキャンはログイン後に使えます。手動入力はログインなしでも使えます。")).toBeInTheDocument();
  });

  it("未ログインでもお試しが残っていれば撮影・アルバムを使え、残り回数を出す", async () => {
    const { user, props } = setupList({ access: scanAccessOf(true, { enabled: true, remaining: 2 }) });
    expect(screen.getByRole("button", { name: /撮影する/ })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: /アルバムから選ぶ/ }));
    expect(props.onAlbum).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/お試しであと 2 回読み取れます/)).toBeInTheDocument();
    expect(screen.queryByText(/ログイン後に使えます/)).not.toBeInTheDocument();
  });

  it("お試しを使い切ったら撮影・アルバムを無効にし、3回までと案内する", () => {
    setupList({ access: scanAccessOf(true, { enabled: true, remaining: 0 }) });
    expect(screen.getByRole("button", { name: /撮影する/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /アルバムから選ぶ/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /手動で入力/ })).toBeEnabled();
    expect(screen.getByText(/お試しの読み取りは3回までです。ログインすると続けて使えます/)).toBeInTheDocument();
  });

  it("閲覧専用では手動入力、スキャン中はすべて押せない。オドメーターモードの案内", () => {
    const { rerender, props } = setupList({ readOnly: true, distanceMode: "odometer" });
    expect(screen.getByRole("button", { name: /手動で入力/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /撮影する/ })).toBeEnabled();
    expect(screen.getByText("メーターはオドメーター（積算距離）が写るように撮影してください")).toBeInTheDocument();
    rerender(<ScanEntryList {...props} readOnly={false} scanning />);
    for (const name of [/撮影する/, /アルバムから選ぶ/, /レシートとメーターを別々に撮る/, /手動で入力/]) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
  });
});
