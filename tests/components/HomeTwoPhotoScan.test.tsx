import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement, type ReactNode } from "react";
import Home from "@/app/(app)/app/page";
import { SCAN_BUTTON_LABEL } from "@/components/AppNav";
import type { Vehicle } from "@/lib/types";
import type { VehicleScope } from "@/lib/useVehicleScope";
import { renderWithProviders } from "../setup/render";

// ログイン中
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: "u1", getToken: async () => "t" }),
  useUser: () => ({ isLoaded: true, isSignedIn: true, user: null }),
  SignedIn: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
  SignedOut: () => null,
  SignInButton: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
  UserButton: () => createElement("div", { "data-testid": "user-button" }),
}));

const nav = vi.hoisted(() => ({ params: new URLSearchParams(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => nav.params,
  usePathname: () => "/app",
}));

// 圧縮はそのまま返す（呼ばれた設定だけ記録する）
const compression = vi.hoisted(() => ({ fn: vi.fn(async (file: File) => file) }));
vi.mock("browser-image-compression", () => ({ default: compression.fn }));

const VEHICLE: Vehicle = { id: "v1", user_id: "u1", name: "マイカー", type: "car", distance_mode: "trip", default_fuel_type: null };
const addRecord = vi.hoisted(() => vi.fn(async (record: Record<string, unknown>) => ({ ...record, id: "new1" })));
vi.mock("@/lib/useVehicleScope", () => ({
  useVehicleScope: (): VehicleScope =>
    ({
      vehicles: [VEHICLE],
      selectedVehicleId: "v1",
      setSelectedVehicleId: vi.fn(),
      selectedVehicle: VEHICLE,
      distanceMode: "trip",
      defaultVehicleId: "v1",
      records: [],
      loading: false,
      vehiclesLoading: false,
      recordsLoading: false,
      error: null,
      readOnly: false,
      outage: null,
      scopeKey: "v1:trip",
      vehicleActions: { addVehicle: vi.fn(), addVehicles: vi.fn(), updateVehicle: vi.fn(), deleteVehicle: vi.fn() },
      recordActions: {
        addRecord,
        addRecords: vi.fn(),
        updateRecord: vi.fn(),
        deleteRecord: vi.fn(),
        fetchAllRecords: vi.fn(),
        refresh: vi.fn(),
      },
    }) as unknown as VehicleScope,
}));

const RESULT = {
  date: "2026-10-03",
  fuel_amount: 40,
  total_cost: 6800,
  price_per_unit: 170,
  total_distance: 512.3,
  odometer: null,
  gas_station: "テスト石油",
  fuel_type: "regular",
  requestId: "req1",
};

const receiptFile = new File(["receipt"], "receipt.jpg", { type: "image/jpeg" });
const meterFile = new File(["meter"], "meter.jpg", { type: "image/jpeg" });

describe("ホーム: レシートとメーターを別々に撮る", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    nav.params = new URLSearchParams();
    nav.replace.mockReset();
    compression.fn.mockClear();
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
    fetchMock = vi.fn(async () => new Response(JSON.stringify(RESULT), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("スキャンメニューから開き、2 枚を 1 回の /api/analyze で読み取って確認シートに出す", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Home />);
    await user.click(screen.getByRole("button", { name: SCAN_BUTTON_LABEL }));
    await user.click(
      within(screen.getByRole("dialog", { name: "記録する" })).getByRole("button", { name: /レシートとメーターを別々に撮る/ })
    );
    const sheet = screen.getByRole("dialog", { name: "レシートとメーターを別々に撮る" });

    await user.click(within(sheet).getByRole("button", { name: "レシートを撮影" }));
    await user.upload(within(sheet).getByLabelText("カメラで撮影（2枚で読み取る）"), receiptFile);
    await user.click(within(sheet).getByRole("button", { name: "メーターをアルバムから選ぶ" }));
    await user.upload(within(sheet).getByLabelText("画像ファイルを選択（2枚で読み取る）"), meterFile);
    await user.click(within(sheet).getByRole("button", { name: "2枚を読み取る" }));

    // 確認シート（2 枚のサムネイル）
    const review = await screen.findByRole("dialog", { name: "読み取り結果の確認" });
    expect(within(review).getByRole("img", { name: "解析したレシートの写真" })).toBeInTheDocument();
    expect(within(review).getByRole("img", { name: "解析したメーターの写真" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "レシートとメーターを別々に撮る" })).not.toBeInTheDocument();

    // 1 枚ずつ小さめの目標で圧縮し、1 回だけ送る（レシート → メーター）
    expect(compression.fn).toHaveBeenCalledTimes(2);
    expect(compression.fn.mock.calls.map(([file]) => (file as File).name)).toEqual(["receipt.jpg", "meter.jpg"]);
    for (const call of compression.fn.mock.calls as unknown as [File, { maxSizeMB: number }][]) {
      expect(call[1].maxSizeMB).toBe(0.6);
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.images.map((img: { role: string }) => img.role)).toEqual(["receipt", "meter"]);
    expect(body.images[0].image).toMatch(/^data:image\/jpeg;base64,/);
    expect("image" in body).toBe(false);
  });

  it("「メーターなしで読み取る」はレシートだけを従来の 1 枚の形で送る", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Home />);
    await user.click(screen.getByRole("button", { name: SCAN_BUTTON_LABEL }));
    await user.click(
      within(screen.getByRole("dialog", { name: "記録する" })).getByRole("button", { name: /レシートとメーターを別々に撮る/ })
    );
    const sheet = screen.getByRole("dialog", { name: "レシートとメーターを別々に撮る" });
    await user.upload(within(sheet).getByLabelText("画像ファイルを選択（2枚で読み取る）"), receiptFile);
    await user.click(within(sheet).getByRole("button", { name: "メーターなしで読み取る" }));

    const review = await screen.findByRole("dialog", { name: "読み取り結果の確認" });
    expect(within(review).getByRole("img", { name: "解析した写真" })).toBeInTheDocument();
    expect(compression.fn).toHaveBeenCalledTimes(1);
    expect((compression.fn.mock.calls[0] as unknown as [File, { maxSizeMB: number }])[1].maxSizeMB).toBe(0.8);
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(Object.keys(body)).toEqual(["image"]);
  });

  it("?action=pair（他の画面のスキャンメニュー）で来たらシートを開き、URL から消す", async () => {
    nav.params = new URLSearchParams("action=pair");
    renderWithProviders(<Home />);
    expect(await screen.findByRole("dialog", { name: "レシートとメーターを別々に撮る" })).toBeInTheDocument();
    expect(nav.replace).toHaveBeenCalledWith("/app");
  });

  it("2 枚の読み取り結果を保存すると、記録の入口は pair になる", async () => {
    const user = userEvent.setup();
    addRecord.mockClear();
    renderWithProviders(<Home />);
    await user.click(screen.getByRole("button", { name: SCAN_BUTTON_LABEL }));
    await user.click(
      within(screen.getByRole("dialog", { name: "記録する" })).getByRole("button", { name: /レシートとメーターを別々に撮る/ })
    );
    const sheet = screen.getByRole("dialog", { name: "レシートとメーターを別々に撮る" });
    await user.click(within(sheet).getByRole("button", { name: "レシートを撮影" }));
    await user.upload(within(sheet).getByLabelText("カメラで撮影（2枚で読み取る）"), receiptFile);
    await user.click(within(sheet).getByRole("button", { name: "メーターをアルバムから選ぶ" }));
    await user.upload(within(sheet).getByLabelText("画像ファイルを選択（2枚で読み取る）"), meterFile);
    await user.click(within(sheet).getByRole("button", { name: "2枚を読み取る" }));

    const review = await screen.findByRole("dialog", { name: "読み取り結果の確認" });
    await user.click(within(review).getByRole("button", { name: "保存" }));
    await waitFor(() => expect(addRecord).toHaveBeenCalledTimes(1));
    expect(addRecord.mock.calls[0][0]).toMatchObject({ source: "pair", fuel_amount: 40 });
  });

  it("PC で画像を 2 枚ドロップすると読み取り方を聞き、「レシートとメーターの組として読む」でドロップした順に選んだ状態のシートを開く", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Home />);
    fireEvent.drop(screen.getByRole("heading", { name: "記録する" }), {
      dataTransfer: { files: [receiptFile, meterFile], items: [] },
    });
    const chooser = await screen.findByRole("dialog", { name: "2枚の写真をどう読み取りますか？" });
    expect(within(chooser).getByRole("button", { name: /2件の給油として一括で読む/ })).toBeInTheDocument();
    await user.click(within(chooser).getByRole("button", { name: /レシートとメーターの組として読む/ }));
    const sheet = await screen.findByRole("dialog", { name: "レシートとメーターを別々に撮る" });
    expect(within(sheet).getByRole("button", { name: "2枚を読み取る" })).toBeEnabled();
    expect(within(sheet).getByRole("button", { name: "レシートとメーターを入れ替える" })).toBeInTheDocument();
    await waitFor(() => expect(within(sheet).getByRole("img", { name: "レシートの画像" })).toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("1 枚のドロップは従来どおりすぐに読み取る（シートは開かない）", async () => {
    renderWithProviders(<Home />);
    fireEvent.drop(screen.getByRole("heading", { name: "記録する" }), {
      dataTransfer: { files: [receiptFile], items: [] },
    });
    expect(await screen.findByRole("dialog", { name: "読み取り結果の確認" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "レシートとメーターを別々に撮る" })).not.toBeInTheDocument();
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(Object.keys(body)).toEqual(["image"]);
  });
});
