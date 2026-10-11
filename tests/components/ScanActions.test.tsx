import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement, type ReactNode } from "react";
import { AppFrame } from "@/components/AppShell";
import { SCAN_BUTTON_LABEL } from "@/components/AppNav";
import { RegisterScanActions, type ScanActionHandlers } from "@/components/ScanActions";
import ScanReadyPrompt from "@/app/app/_components/ScanReadyPrompt";
import { renderWithProviders } from "../setup/render";

// ログイン中（tests/setup/dom.ts の未ログインのモックを上書きする）
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: "u1", getToken: async () => "t" }),
  useUser: () => ({ isLoaded: true, isSignedIn: true, user: null }),
  SignedIn: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
  SignedOut: () => null,
  SignInButton: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
  UserButton: () => createElement("div", { "data-testid": "user-button" }),
}));

function handlers(overrides: Partial<ScanActionHandlers> = {}): ScanActionHandlers {
  return {
    openCamera: vi.fn(),
    openAlbum: vi.fn(),
    openManual: vi.fn(),
    canScan: true,
    canManual: true,
    disabledReason: null,
    ...overrides,
  };
}

function Page({ h, registered = true }: { h: ScanActionHandlers; registered?: boolean }) {
  return (
    <AppFrame>
      {registered && <RegisterScanActions {...h} />}
      <p>本文</p>
    </AppFrame>
  );
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: SCAN_BUTTON_LABEL }));
  return screen.getByRole("dialog", { name: "記録する" });
}

describe("ScanActionMenu と ScanActions（/app 表示中の直接呼び出し）", () => {
  it("ホームが登録していれば、項目のクリックの中で openCamera / openAlbum / openManual を直接呼び、メニューを閉じる", async () => {
    const user = userEvent.setup();
    const h = handlers();
    renderWithProviders(<Page h={h} />);

    let dialog = await openMenu(user);
    // 遷移のリンクではなくボタン
    expect(within(dialog).queryByRole("link")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: /撮影する/ }));
    expect(h.openCamera).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    dialog = await openMenu(user);
    await user.click(within(dialog).getByRole("button", { name: /アルバムから選ぶ/ }));
    expect(h.openAlbum).toHaveBeenCalledTimes(1);

    dialog = await openMenu(user);
    await user.click(within(dialog).getByRole("button", { name: /手動で入力/ }));
    expect(h.openManual).toHaveBeenCalledTimes(1);
  });

  it("ファイル選択はクリックと同じ呼び出しの中で開く（タップの扱いを保つ）", async () => {
    const user = userEvent.setup();
    const calls: string[] = [];
    const h = handlers({ openCamera: () => calls.push("camera") });
    renderWithProviders(<Page h={h} />);
    const dialog = await openMenu(user);
    const item = within(dialog).getByRole("button", { name: /撮影する/ });
    // click() は同期的にハンドラを実行する。戻った時点で呼ばれていること
    item.click();
    expect(calls).toEqual(["camera"]);
  });

  it("解析中などは canScan / canManual に従って項目を無効にし、理由を添える", async () => {
    const user = userEvent.setup();
    const h = handlers({ canScan: false, canManual: false, disabledReason: "読み取り中です。終わるまで新しい記録は始められません" });
    renderWithProviders(<Page h={h} />);
    const dialog = await openMenu(user);
    expect(within(dialog).getByRole("button", { name: /撮影する/ })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: /アルバムから選ぶ/ })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: /手動で入力/ })).toBeDisabled();
    expect(within(dialog).getByText("読み取り中です。終わるまで新しい記録は始められません")).toBeInTheDocument();
  });

  it("閲覧専用では手動入力だけ無効", async () => {
    const user = userEvent.setup();
    const h = handlers({ canManual: false, disabledReason: "閲覧専用のため手動入力はできません" });
    renderWithProviders(<Page h={h} />);
    const dialog = await openMenu(user);
    expect(within(dialog).getByRole("button", { name: /撮影する/ })).toBeEnabled();
    expect(within(dialog).getByRole("button", { name: /手動で入力/ })).toBeDisabled();
    expect(within(dialog).getByText("閲覧専用のため手動入力はできません")).toBeInTheDocument();
  });

  it("登録が無い画面（/history など）では /app?action=… へのリンクのまま", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Page h={handlers()} registered={false} />);
    const dialog = await openMenu(user);
    expect(within(dialog).getByRole("link", { name: /撮影する/ })).toHaveAttribute("href", "/app?action=scan");
    expect(within(dialog).getByRole("link", { name: /アルバムから選ぶ/ })).toHaveAttribute("href", "/app?action=album");
    expect(within(dialog).getByRole("link", { name: /手動で入力/ })).toHaveAttribute("href", "/app?action=manual");
  });

  it("ホームがアンマウントされたら登録を解除する", async () => {
    const user = userEvent.setup();
    const h = handlers();
    const { rerender } = renderWithProviders(<Page h={h} />);
    rerender(<Page h={h} registered={false} />);
    const dialog = await openMenu(user);
    expect(within(dialog).getByRole("link", { name: /撮影する/ })).toHaveAttribute("href", "/app?action=scan");
  });

  it("登録した関数は最新のものを呼ぶ（再登録なしで差し替わる）", async () => {
    const user = userEvent.setup();
    const first = handlers();
    const second = handlers();
    const { rerender } = renderWithProviders(<Page h={first} />);
    rerender(<Page h={second} />);
    const dialog = await openMenu(user);
    await user.click(within(dialog).getByRole("button", { name: /撮影する/ }));
    expect(first.openCamera).not.toHaveBeenCalled();
    expect(second.openCamera).toHaveBeenCalledTimes(1);
  });
});

describe("ScanReadyPrompt", () => {
  it("「撮影の準備ができました」と 撮影する / アルバムから選ぶ / 閉じる", async () => {
    const user = userEvent.setup();
    const onCamera = vi.fn();
    const onAlbum = vi.fn();
    const onDismiss = vi.fn();
    renderWithProviders(<ScanReadyPrompt onCamera={onCamera} onAlbum={onAlbum} onDismiss={onDismiss} />);
    expect(screen.getByRole("heading", { name: "撮影の準備ができました" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "撮影する" }));
    await user.click(screen.getByRole("button", { name: "アルバムから選ぶ" }));
    await user.click(screen.getByRole("button", { name: "閉じる" }));
    expect(onCamera).toHaveBeenCalledTimes(1);
    expect(onAlbum).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
