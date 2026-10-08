import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { useToast, type ConfirmOptions, type ToastOptions } from "@/components/Toast";
import { renderWithProviders } from "../setup/render";

/** useToast() の toast / confirm をテストから呼ぶためのハーネス */
function Harness({
  onConfirmResult,
  confirmOptions,
  toastOptions,
}: {
  onConfirmResult?: (ok: boolean) => void;
  confirmOptions?: ConfirmOptions;
  toastOptions?: ToastOptions;
}) {
  const { toast, confirm } = useToast();
  return (
    <>
      <button type="button" onClick={() => toast("保存しました", toastOptions)}>
        トースト
      </button>
      <button
        type="button"
        onClick={async () => onConfirmResult?.(await confirm("削除しますか？", confirmOptions))}
      >
        確認
      </button>
    </>
  );
}

describe("Toast: toast()", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("表示され、既定の 4 秒で自動的に消える", () => {
    renderWithProviders(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "トースト" }));
    expect(screen.getByRole("status")).toHaveTextContent("保存しました");

    act(() => {
      vi.advanceTimersByTime(3999);
    });
    expect(screen.getByText("保存しました")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText("保存しました")).not.toBeInTheDocument();
  });

  it("error は role=alert で 8 秒まで残る", () => {
    renderWithProviders(<Harness toastOptions={{ type: "error" }} />);
    fireEvent.click(screen.getByRole("button", { name: "トースト" }));
    expect(screen.getByRole("alert")).toHaveTextContent("保存しました");

    act(() => {
      vi.advanceTimersByTime(7999);
    });
    expect(screen.getByText("保存しました")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText("保存しました")).not.toBeInTheDocument();
  });

  it("durationMs: 0 は自動で消えず、閉じるボタンで消える", () => {
    renderWithProviders(<Harness toastOptions={{ durationMs: 0 }} />);
    fireEvent.click(screen.getByRole("button", { name: "トースト" }));
    act(() => {
      vi.advanceTimersByTime(60000);
    });
    expect(screen.getByText("保存しました")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(screen.queryByText("保存しました")).not.toBeInTheDocument();
  });
});

describe("Toast: confirm()", () => {
  it("ダイアログが開き、OK で true を返す", async () => {
    const onResult = vi.fn();
    renderWithProviders(<Harness onConfirmResult={onResult} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "確認" }));
    const dialog = await screen.findByRole("dialog", { name: "確認" });
    expect(dialog).toHaveTextContent("削除しますか？");

    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    await vi.waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("キャンセルで false を返す", async () => {
    const onResult = vi.fn();
    renderWithProviders(<Harness onConfirmResult={onResult} />);
    fireEvent.click(screen.getByRole("button", { name: "確認" }));
    await screen.findByRole("dialog");

    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    await vi.waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("Escape で false を返す", async () => {
    const onResult = vi.fn();
    renderWithProviders(<Harness onConfirmResult={onResult} />);
    fireEvent.click(screen.getByRole("button", { name: "確認" }));
    await screen.findByRole("dialog");

    fireEvent.keyDown(window, { key: "Escape" });
    await vi.waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });

  it("title / ラベル / danger の指定が反映される（danger はキャンセルに初期フォーカス）", async () => {
    renderWithProviders(
      <Harness
        onConfirmResult={() => {}}
        confirmOptions={{ title: "車両を削除", confirmLabel: "削除", cancelLabel: "やめる", danger: true }}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "確認" }));

    expect(await screen.findByRole("dialog", { name: "車両を削除" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "削除" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "やめる" })).toHaveFocus();
  });
});
