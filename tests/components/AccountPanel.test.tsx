import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement, type ReactNode } from "react";
import type { Vehicle } from "@/lib/types";
import { renderWithProviders } from "../setup/render";

const clerk = vi.hoisted(() => ({ signOut: vi.fn(), signedIn: true }));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: clerk.signedIn,
    userId: clerk.signedIn ? "u1" : null,
    getToken: async () => "t",
  }),
  useUser: () => ({ isLoaded: true, isSignedIn: clerk.signedIn, user: null }),
  useClerk: () => ({ signOut: clerk.signOut }),
  SignedIn: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
  SignedOut: () => null,
  SignInButton: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
  UserButton: () => createElement("div", { "data-testid": "user-button" }),
}));

const scopeMock = vi.hoisted(() => ({ useVehicleScope: vi.fn() }));
vi.mock("@/lib/useVehicleScope", () => scopeMock);

const storesMock = vi.hoisted(() => ({ useDataStores: vi.fn() }));
vi.mock("@/lib/data/useDataStores", () => storesMock);

import SettingsPage from "@/app/settings/page";

const CONFIRM_LABEL = "確認のため「削除」と入力してください";

function scope(overrides: Record<string, unknown> = {}) {
  return {
    vehicles: [{ id: "v1", name: "マイカー" } as Vehicle],
    loading: false,
    error: null,
    readOnly: false,
    vehicleActions: { addVehicles: vi.fn() },
    recordActions: { fetchAllRecords: vi.fn(async () => []), addRecords: vi.fn() },
    ...overrides,
  };
}

function cloudStores(deleteAccountData = vi.fn(async () => {})) {
  storesMock.useDataStores.mockReturnValue({
    isLoaded: true,
    isSignedIn: true,
    userId: "u1",
    stores: { kind: "cloud", userId: "u1", deleteAccountData },
  });
  return deleteAccountData;
}

const fetchMock = vi.fn();

beforeEach(() => {
  clerk.signedIn = true;
  clerk.signOut.mockReset();
  clerk.signOut.mockResolvedValue(undefined);
  scopeMock.useVehicleScope.mockReset();
  scopeMock.useVehicleScope.mockReturnValue(scope());
  storesMock.useDataStores.mockReset();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** 「アカウントを削除」→ 確認ダイアログで「次へ」 */
async function openTypingStep(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /アカウントを削除/ }));
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "次へ" }));
  return screen.findByLabelText(CONFIRM_LABEL);
}

describe("設定画面のアカウント削除", () => {
  it("確認ダイアログでキャンセルすると何もしない", async () => {
    const deleteAccountData = cloudStores();
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />);

    await user.click(screen.getByRole("button", { name: /アカウントを削除/ }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("元に戻せません");
    await user.click(within(dialog).getByRole("button", { name: "キャンセル" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByLabelText(CONFIRM_LABEL)).not.toBeInTheDocument();
    expect(deleteAccountData).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(clerk.signOut).not.toHaveBeenCalled();
  });

  it("「削除」と入力するまで最後のボタンは押せない", async () => {
    cloudStores();
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />);

    const input = await openTypingStep(user);
    const final = screen.getByRole("button", { name: "完全に削除する" });
    expect(final).toBeDisabled();
    await user.type(input, "さくじょ");
    expect(final).toBeDisabled();
    await user.clear(input);
    await user.type(input, "削除");
    expect(final).toBeEnabled();
    // バックアップへのページ内リンク
    expect(screen.getByRole("link", { name: "バックアップ" })).toHaveAttribute("href", "#settings-backup");
  });

  it("成功: データを削除 → DELETE /api/account → ログアウトして /?deleted=1 へ", async () => {
    const deleteAccountData = cloudStores();
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />);

    await user.type(await openTypingStep(user), "削除");
    await user.click(screen.getByRole("button", { name: "完全に削除する" }));

    await waitFor(() => expect(clerk.signOut).toHaveBeenCalledWith({ redirectUrl: "/?deleted=1" }));
    expect(deleteAccountData).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/account", expect.objectContaining({ method: "DELETE" }));
    expect(deleteAccountData.mock.invocationCallOrder[0]).toBeLessThan(fetchMock.mock.invocationCallOrder[0]);
  });

  it("データの削除に失敗したら API を呼ばない", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const deleteAccountData = cloudStores(vi.fn(async () => Promise.reject(new Error("クラウドに接続できません。"))));
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />);

    await user.type(await openTypingStep(user), "削除");
    await user.click(screen.getByRole("button", { name: "完全に削除する" }));

    await waitFor(() => expect(deleteAccountData).toHaveBeenCalled());
    expect((await screen.findAllByText("クラウドに接続できません。")).length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(clerk.signOut).not.toHaveBeenCalled();
  });

  it("データの削除後に API が失敗したら、データは削除済みでアカウントが残ったことを伝え、再試行できる", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const deleteAccountData = cloudStores();
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: "アカウントを削除できませんでした。", code: "DELETE_FAILED", requestId: "req123" }, { status: 500 })
    );
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />);

    await user.type(await openTypingStep(user), "削除");
    await user.click(screen.getByRole("button", { name: "完全に削除する" }));

    const messages = await screen.findAllByText(
      /記録と車両は削除しましたが、アカウントを削除できませんでした（エラーID: req123）/
    );
    expect(messages.length).toBeGreaterThan(0);
    expect(screen.getByText("記録と車両は削除済みです。アカウントだけが残っています。")).toBeInTheDocument();
    expect(clerk.signOut).not.toHaveBeenCalled();

    // 再試行（2 回目の API は成功）
    await user.click(screen.getByRole("button", { name: "完全に削除する" }));
    await waitFor(() => expect(clerk.signOut).toHaveBeenCalledWith({ redirectUrl: "/?deleted=1" }));
    expect(deleteAccountData).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("閲覧専用中は削除を始められない", () => {
    cloudStores();
    scopeMock.useVehicleScope.mockReturnValue(scope({ readOnly: true }));
    renderWithProviders(<SettingsPage />);
    expect(screen.getByRole("button", { name: /アカウントを削除/ })).toBeDisabled();
    expect(screen.getByText("閲覧専用（クラウド接続待ち）のため削除できません")).toBeInTheDocument();
  });

  it("未ログインでは、この端末のデータの削除だけを出す", async () => {
    clerk.signedIn = false;
    const clearAll = vi.fn(async () => {});
    storesMock.useDataStores.mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
      userId: null,
      stores: { kind: "local", clearAll },
    });
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />);

    expect(screen.queryByRole("button", { name: /アカウントを削除/ })).not.toBeInTheDocument();
    expect(
      screen.getByText("ログインしていないため、データは端末内だけにあります。ブラウザの保存データを消すと削除されます。")
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "この端末のデータをすべて削除" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "削除する" }));
    await waitFor(() => expect(clearAll).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("この端末のデータを削除しました")).toBeInTheDocument();
  });
});
