import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ShareCardButton from "@/components/share/ShareCardButton";
import { SHARE_URL } from "@/lib/share/card";
import type { FuelRecord } from "@/lib/types";
import { renderWithProviders } from "../setup/render";

function rec(id: string, date: string, extra: Partial<FuelRecord> = {}): FuelRecord {
  return {
    id,
    date,
    total_distance: null,
    fuel_amount: null,
    gas_station: null,
    price_per_unit: null,
    total_cost: null,
    fuel_efficiency: null,
    ...extra,
  };
}

// 連鎖計算済みの形（run_* は applyFillChain が満タン給油に付ける導出値）
const RECORDS: FuelRecord[] = [
  rec("b", "2026-10-10", { total_distance: 625.4, fuel_amount: 10, total_cost: 1700, fuel_efficiency: 62.54, run_distance: 625.4, run_fuel: 10 }),
  rec("a", "2026-09-20", { total_distance: 500, fuel_amount: 10, total_cost: 1650, fuel_efficiency: 50, run_distance: 500, run_fuel: 10 }),
];

const originalShare = Object.getOwnPropertyDescriptor(navigator, "share");
const originalCanShare = Object.getOwnPropertyDescriptor(navigator, "canShare");

function setNavigatorShare(share: ((data: ShareData) => Promise<void>) | undefined, canShare: boolean) {
  Object.defineProperty(navigator, "share", { configurable: true, writable: true, value: share });
  Object.defineProperty(navigator, "canShare", {
    configurable: true,
    writable: true,
    value: share ? vi.fn(() => canShare) : undefined,
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 14, 12, 0));

  // jsdom には canvas が無いので、2D コンテキストと toBlob をモックする
  const ctx = new Proxy(
    {},
    {
      get: (_target, key) => (key === "measureText" ? () => ({ width: 10 }) : vi.fn()),
      set: () => true,
    }
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (cb: BlobCallback) {
    cb(new Blob(["png"], { type: "image/png" }));
  });
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:card"), revokeObjectURL: vi.fn() }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (originalShare) Object.defineProperty(navigator, "share", originalShare);
  else delete (navigator as { share?: unknown }).share;
  if (originalCanShare) Object.defineProperty(navigator, "canShare", originalCanShare);
  else delete (navigator as { canShare?: unknown }).canShare;
});

async function openModal() {
  const user = userEvent.setup();
  renderWithProviders(<ShareCardButton records={RECORDS} vehicleName="プリウス" />);
  await user.click(screen.getByRole("button", { name: "今月の燃費をシェア" }));
  expect(screen.getByRole("dialog", { name: "燃費をシェア" })).toBeInTheDocument();
  await screen.findByRole("img", { name: /62\.54 km\/L/ });
  return user;
}

describe("ShareCardButton / ShareCardModal", () => {
  it("ファイルを共有できる端末では「共有する」で画像・文言・URL を navigator.share に渡す", async () => {
    const share = vi.fn<(data: ShareData) => Promise<void>>(async () => {});
    setNavigatorShare(share, true);
    const user = await openModal();

    await user.click(screen.getByRole("button", { name: "共有する" }));
    expect(share).toHaveBeenCalledTimes(1);
    const data = share.mock.calls[0][0];
    expect(data.text).toBe("今月の燃費は 62.54 km/L でした #燃費記録 #FuelLens");
    expect(data.url).toBe(SHARE_URL);
    expect(data.files?.[0]).toBeInstanceOf(File);
    expect(data.files?.[0].name).toBe("fuellens-2026-10.png");
    expect(data.files?.[0].type).toBe("image/png");
    expect(await screen.findByText("共有しました")).toBeInTheDocument();
  });

  it("共有をキャンセル（AbortError）しても何も表示しない。それ以外の失敗はエラーを表示する", async () => {
    const share = vi
      .fn<(data: ShareData) => Promise<void>>()
      .mockRejectedValueOnce(new DOMException("cancel", "AbortError"))
      .mockRejectedValueOnce(new Error("NotAllowedError"));
    setNavigatorShare(share, true);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = await openModal();

    await user.click(screen.getByRole("button", { name: "共有する" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "共有する" })).toBeEnabled());
    expect(screen.queryByText(/共有できませんでした/)).not.toBeInTheDocument();
    expect(screen.queryByText("共有しました")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "共有する" }));
    expect(await screen.findByText("共有できませんでした。画像を保存してから投稿してください")).toBeInTheDocument();
  });

  it("共有できない端末（PC）では「共有する」を出さず、X の投稿画面のリンクと画像の保存を出す", async () => {
    setNavigatorShare(undefined, false);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const user = await openModal();

    expect(screen.queryByRole("button", { name: "共有する" })).not.toBeInTheDocument();
    const x = screen.getByRole("link", { name: "X に投稿" });
    expect(x).toHaveAttribute("target", "_blank");
    const intent = new URL(x.getAttribute("href")!);
    expect(intent.origin + intent.pathname).toBe("https://twitter.com/intent/tweet");
    expect(intent.searchParams.get("text")).toBe("今月の燃費は 62.54 km/L でした #燃費記録 #FuelLens");
    expect(intent.searchParams.get("url")).toBe(SHARE_URL);
    expect(screen.getByText(/X の投稿画面には画像を添付できません/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "画像を保存" }));
    expect(click).toHaveBeenCalledTimes(1);
    const anchor = click.mock.instances[0] as unknown as HTMLAnchorElement;
    expect(anchor.download).toBe("fuellens-2026-10.png");
    expect(await screen.findByText("画像を保存しました")).toBeInTheDocument();
  });

  it("閉じるとプレビューの URL を解放する", async () => {
    setNavigatorShare(undefined, false);
    const user = await openModal();
    await user.click(screen.getByRole("button", { name: "閉じる" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:card");
  });

  it("燃費が出ていなければボタンを出さず、disabled の間は押せない", () => {
    const partial = [rec("p", "2026-10-10", { total_distance: 100, fuel_amount: 5, is_full: false })];
    const { unmount } = renderWithProviders(<ShareCardButton records={partial} />);
    expect(screen.queryByRole("button", { name: /燃費をシェア/ })).not.toBeInTheDocument();
    unmount();

    renderWithProviders(<ShareCardButton records={RECORDS} disabled />);
    expect(screen.getByRole("button", { name: "今月の燃費をシェア" })).toBeDisabled();
  });
});
