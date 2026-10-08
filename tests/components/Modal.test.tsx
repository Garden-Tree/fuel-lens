import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef } from "react";
import Modal, { type ModalProps } from "@/components/Modal";

type Props = Partial<Omit<ModalProps, "children">>;

function Sample(props: Props) {
  return (
    <Modal open onClose={() => {}} title="テスト見出し" {...props}>
      <Modal.Header />
      <Modal.Body>
        <input aria-label="入力欄" />
      </Modal.Body>
      <Modal.Footer>
        <button type="button">フッター</button>
      </Modal.Footer>
    </Modal>
  );
}

/** 背景要素（role=dialog の親） */
const backdropOf = (dialog: HTMLElement) => dialog.parentElement as HTMLElement;

describe("Modal", () => {
  it("open=false では何も描画しない", () => {
    render(<Sample open={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("role=dialog / aria-modal / aria-labelledby で見出しに結び付く", () => {
    render(<Sample />);
    const dialog = screen.getByRole("dialog", { name: "テスト見出し" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy as string)).toHaveTextContent("テスト見出し");
  });

  it("labelledBy で見出しの id を固定できる", () => {
    render(<Sample labelledBy="my-title" />);
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-labelledby", "my-title");
    expect(document.getElementById("my-title")).toHaveTextContent("テスト見出し");
  });

  it("Escape で onClose が呼ばれる", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Sample onClose={onClose} />);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("onEscape を渡すと Escape はそちらだけが呼ばれる", async () => {
    const onClose = vi.fn();
    const onEscape = vi.fn();
    const user = userEvent.setup();
    render(<Sample onClose={onClose} onEscape={onEscape} />);
    await user.keyboard("{Escape}");
    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closeOnEscape=false では Escape を無視する", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Sample onClose={onClose} closeOnEscape={false} />);
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("× ボタンで onClose が呼ばれる", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Sample onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "閉じる" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("背景クリックで onClose が呼ばれる", () => {
    const onClose = vi.fn();
    render(<Sample onClose={onClose} />);
    const backdrop = backdropOf(screen.getByRole("dialog"));
    fireEvent.pointerDown(backdrop);
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("パネル内で押下して背景で離した（ドラッグ）場合は閉じない", () => {
    const onClose = vi.fn();
    render(<Sample onClose={onClose} />);
    const dialog = screen.getByRole("dialog");
    const backdrop = backdropOf(dialog);
    fireEvent.pointerDown(screen.getByLabelText("入力欄"));
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("パネル内のクリックでは閉じない", () => {
    const onClose = vi.fn();
    render(<Sample onClose={onClose} />);
    const dialog = screen.getByRole("dialog");
    fireEvent.pointerDown(dialog);
    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closeOnBackdrop=false では背景クリックを無視する", () => {
    const onClose = vi.fn();
    render(<Sample onClose={onClose} closeOnBackdrop={false} />);
    const backdrop = backdropOf(screen.getByRole("dialog"));
    fireEvent.pointerDown(backdrop);
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("disableClose の間は Escape・背景クリック・× をすべて無視する", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Sample onClose={onClose} disableClose />);
    const backdrop = backdropOf(screen.getByRole("dialog"));

    await user.keyboard("{Escape}");
    fireEvent.pointerDown(backdrop);
    fireEvent.click(backdrop);
    expect(screen.getByRole("button", { name: "閉じる" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "閉じる" }));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("初期フォーカスは既定で × ボタン", () => {
    render(<Sample />);
    expect(screen.getByRole("button", { name: "閉じる" })).toHaveFocus();
  });

  it("initialFocusRef を渡すとその要素にフォーカスする", () => {
    function WithRef() {
      const ref = useRef<HTMLInputElement>(null);
      return (
        <Modal open onClose={() => {}} title="見出し" initialFocusRef={ref}>
          <Modal.Header />
          <input ref={ref} aria-label="最初の入力" />
        </Modal>
      );
    }
    render(<WithRef />);
    expect(screen.getByLabelText("最初の入力")).toHaveFocus();
  });

  it("閉じたら開く前にフォーカスしていた要素へ戻す", () => {
    function Host({ open }: { open: boolean }) {
      return (
        <>
          <button type="button">開くボタン</button>
          <Sample open={open} />
        </>
      );
    }
    const { rerender } = render(<Host open={false} />);
    const opener = screen.getByRole("button", { name: "開くボタン" });
    opener.focus();
    rerender(<Host open />);
    expect(opener).not.toHaveFocus();
    rerender(<Host open={false} />);
    expect(opener).toHaveFocus();
  });

  it("lockBodyScroll の間だけ body のスクロールを止める", () => {
    const { rerender } = render(<Sample lockBodyScroll />);
    expect(document.body.style.overflow).toBe("hidden");
    rerender(<Sample lockBodyScroll open={false} />);
    expect(document.body.style.overflow).toBe("");
  });

  it("lockBodyScroll 未指定では body に触れない", () => {
    render(<Sample />);
    expect(document.body.style.overflow).toBe("");
  });

  it("Modal.Header は Modal の外では使えない", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Modal.Header />)).toThrow("Modal.Header は <Modal> の内側でのみ使用できます");
    spy.mockRestore();
  });
});
