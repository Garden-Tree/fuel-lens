import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement, type ReactNode } from "react";
import Home from "@/app/app/page";
import { SCAN_BUTTON_LABEL } from "@/components/AppNav";
import type { FuelRecord, Vehicle } from "@/lib/types";
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

const VEHICLE: Vehicle = { id: "v1", user_id: "u1", name: "マイカー", type: "car", distance_mode: "trip", default_fuel_type: null };
const RECORD: FuelRecord = {
  id: "r1",
  date: "2026-09-30",
  total_distance: 450,
  fuel_amount: 30,
  total_cost: 4800,
  price_per_unit: 160,
  fuel_efficiency: 15,
  gas_station: "ENEOS",
  vehicle_id: "v1",
  run_distance: 450,
  run_fuel: 30,
};

const state = vi.hoisted(() => ({ readOnly: false }));
vi.mock("@/lib/useVehicleScope", () => ({
  useVehicleScope: (): VehicleScope =>
    ({
      vehicles: [VEHICLE],
      selectedVehicleId: "v1",
      setSelectedVehicleId: vi.fn(),
      selectedVehicle: VEHICLE,
      distanceMode: "trip",
      defaultVehicleId: "v1",
      records: [RECORD],
      loading: false,
      vehiclesLoading: false,
      recordsLoading: false,
      error: null,
      readOnly: state.readOnly,
      outage: null,
      scopeKey: "v1:trip",
      vehicleActions: { addVehicle: vi.fn(), addVehicles: vi.fn(), updateVehicle: vi.fn(), deleteVehicle: vi.fn() },
      recordActions: {
        addRecord: vi.fn(),
        addRecords: vi.fn(),
        updateRecord: vi.fn(),
        deleteRecord: vi.fn(),
        fetchAllRecords: vi.fn(),
        refresh: vi.fn(),
      },
    }) as unknown as VehicleScope,
}));

describe("ホーム（/app）のスキャンの入口", () => {
  let inputClick: { mock: { contexts: unknown[] } };

  beforeEach(() => {
    nav.params = new URLSearchParams();
    nav.replace.mockReset();
    state.readOnly = false;
    inputClick = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** 押されたファイル入力（カメラは capture 付き） */
  const clickedInputs = () => inputClick.mock.contexts.map((el: unknown) => ((el as HTMLInputElement).hasAttribute("capture") ? "camera" : "album"));

  it("?action=scan で来たら撮影を試し、「撮影の準備ができました」の案内を出す（ボタンでもう一度開ける・閉じられる）", async () => {
    const user = userEvent.setup();
    nav.params = new URLSearchParams("action=scan");
    renderWithProviders(<Home />);
    expect(clickedInputs()).toEqual(["camera"]);
    expect(nav.replace).toHaveBeenCalledWith("/app");

    const prompt = screen.getByRole("region", { name: "撮影の準備ができました" });
    await user.click(within(prompt).getByRole("button", { name: "撮影する" }));
    await user.click(within(prompt).getByRole("button", { name: "アルバムから選ぶ" }));
    expect(clickedInputs()).toEqual(["camera", "camera", "album"]);

    await user.click(within(prompt).getByRole("button", { name: "閉じる" }));
    expect(screen.queryByRole("region", { name: "撮影の準備ができました" })).not.toBeInTheDocument();
  });

  it("画面内のスキャンメニューは URL を経由せずにタップの中でカメラを開き、案内は出さない", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Home />);
    await user.click(screen.getByRole("button", { name: SCAN_BUTTON_LABEL }));
    await user.click(within(screen.getByRole("dialog", { name: "記録する" })).getByRole("button", { name: /撮影する/ }));
    expect(clickedInputs()).toEqual(["camera"]);
    expect(nav.replace).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "撮影の準備ができました" })).not.toBeInTheDocument();
  });

  it("閲覧専用で ?action=manual が来たら、フォームを開かずに理由を伝えて URL から消す", async () => {
    state.readOnly = true;
    nav.params = new URLSearchParams("action=manual");
    renderWithProviders(<Home />);
    expect(await screen.findByText("閲覧専用のため手動入力はできません")).toBeInTheDocument();
    expect(nav.replace).toHaveBeenCalledWith("/app");
    expect(screen.queryByRole("heading", { name: "手動で記録を追加" })).not.toBeInTheDocument();
  });

  it("編集中に「手動で入力」を選ぶと破棄してよいか確認する（キャンセルなら編集を続ける）", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Home />);
    await user.click(screen.getByRole("button", { name: "編集" }));
    expect(screen.getByRole("heading", { name: "給油記録の編集" })).toBeInTheDocument();

    const chooseManual = async () => {
      await user.click(screen.getByRole("button", { name: SCAN_BUTTON_LABEL }));
      await user.click(within(screen.getByRole("dialog", { name: "記録する" })).getByRole("button", { name: /手動で入力/ }));
      return screen.findByRole("dialog", { name: "確認" });
    };

    let confirm = await chooseManual();
    expect(within(confirm).getByText("入力中の内容を破棄して新しく入力しますか？")).toBeInTheDocument();
    await user.click(within(confirm).getByRole("button", { name: "キャンセル" }));
    expect(screen.getByRole("heading", { name: "給油記録の編集" })).toBeInTheDocument();

    confirm = await chooseManual();
    await user.click(within(confirm).getByRole("button", { name: "破棄して入力" }));
    expect(await screen.findByRole("heading", { name: "手動で記録を追加" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "給油記録の編集" })).not.toBeInTheDocument();
  });
});
