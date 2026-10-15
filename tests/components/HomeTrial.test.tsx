import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "@/app/(app)/app/page";
import { SCAN_BUTTON_LABEL } from "@/components/AppNav";
import { TrialProvider } from "@/lib/scan/trialContext";
import type { TrialState } from "@/lib/trial";
import type { Vehicle } from "@/lib/types";
import type { VehicleScope } from "@/lib/useVehicleScope";
import { renderWithProviders } from "../setup/render";

// 未ログイン（tests/setup/dom.ts の Clerk のモック）。記録はこのブラウザ（ローカル）の想定で、まだ無い

const VEHICLE: Vehicle = { id: "local", user_id: null, name: "メインカー", type: "car", distance_mode: "trip", default_fuel_type: null } as unknown as Vehicle;

vi.mock("@/lib/useVehicleScope", () => ({
  useVehicleScope: (): VehicleScope =>
    ({
      vehicles: [VEHICLE],
      selectedVehicleId: "local",
      setSelectedVehicleId: vi.fn(),
      selectedVehicle: VEHICLE,
      distanceMode: "trip",
      defaultVehicleId: "local",
      records: [],
      loading: false,
      vehiclesLoading: false,
      recordsLoading: false,
      error: null,
      readOnly: false,
      outage: null,
      scopeKey: "local:trip",
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

const api = vi.hoisted(() => ({ requestAnalyze: vi.fn() }));
vi.mock("@/lib/scan/analyzeClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/scan/analyzeClient")>();
  return {
    ...actual,
    compressToDataUrl: async () => "data:image/jpeg;base64,AAAA",
    requestAnalyze: api.requestAnalyze,
  };
});

function renderHome(initial: TrialState) {
  return renderWithProviders(
    <TrialProvider initial={initial}>
      <Home />
    </TrialProvider>
  );
}

const entryList = () => screen.getByRole("button", { name: /手動で入力/ }).closest("div.flex.flex-col") as HTMLElement;

describe("未ログインのお試し読み取り（ホーム）", () => {
  beforeEach(() => {
    api.requestAnalyze.mockReset();
  });

  it("お試しが無効なら従来どおり撮影・アルバムを無効にして「ログイン後に使えます」と案内する", () => {
    renderHome({ enabled: false, remaining: 0 });
    expect(screen.getByRole("button", { name: /撮影する/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /アルバムから選ぶ/ })).toBeDisabled();
    expect(screen.getByText("AIスキャンはログイン後に使えます。手動入力はログインなしでも使えます。")).toBeInTheDocument();
  });

  it("残りがあれば撮影・アルバム・スキャンメニューを使え、読み取り後はサーバーの残り回数で表示を更新する", async () => {
    const user = userEvent.setup();
    api.requestAnalyze.mockResolvedValue({
      ok: true,
      status: 200,
      body: { date: "2026-10-12", fuel_amount: 23.85, total_cost: 4221, price_per_unit: 177, total_distance: 384.4, requestId: "r1" },
      retryAfter: null,
      trialRemaining: 2,
    });
    renderHome({ enabled: true, remaining: 3 });

    expect(screen.getByRole("button", { name: /撮影する/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /アルバムから選ぶ/ })).toBeEnabled();
    expect(within(entryList()).getByText(/お試しであと 3 回読み取れます/)).toBeInTheDocument();

    // スキャンメニューでも撮影・アルバムを選べ、残り回数を添える
    await user.click(screen.getByRole("button", { name: SCAN_BUTTON_LABEL }));
    const menu = screen.getByRole("dialog", { name: "記録する" });
    expect(within(menu).getByRole("button", { name: /撮影する/ })).toBeEnabled();
    expect(within(menu).getByText(/お試しであと 3 回読み取れます/)).toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.upload(screen.getByLabelText("画像ファイルを選択"), new File(["x"], "receipt.jpg", { type: "image/jpeg" }));
    expect(api.requestAnalyze).toHaveBeenCalledTimes(1);
    // 確認シートが開き（保存先はこのブラウザ）、残り回数はサーバーの値になる
    expect(await screen.findByText(/お試しであと 2 回読み取れます/)).toBeInTheDocument();
    expect(screen.queryByText(/ログイン後に使えます/)).not.toBeInTheDocument();
  });

  it("TRIAL_EXHAUSTED ならメッセージを出し、撮影・アルバムを無効にしてログインを案内する（閉じられる）", async () => {
    const user = userEvent.setup();
    api.requestAnalyze.mockResolvedValue({
      ok: false,
      status: 401,
      body: { error: "お試しの読み取りは3回までです。ログインすると続けて使えます", code: "TRIAL_EXHAUSTED", requestId: "r2" },
      retryAfter: null,
      trialRemaining: 0,
    });
    // 表示上は残り 1 回でも、判定はサーバー（Cookie）が行う
    renderHome({ enabled: true, remaining: 1 });
    expect(screen.queryByRole("region", { name: /使い切りました/ })).not.toBeInTheDocument();

    await user.upload(screen.getByLabelText("画像ファイルを選択"), new File(["x"], "receipt.jpg", { type: "image/jpeg" }));

    expect(await screen.findByText("お試しの読み取りは3回までです。ログインすると続けて使えます")).toBeInTheDocument();
    const prompt = screen.getByRole("region", { name: "お試しの読み取り（3回）を使い切りました" });
    expect(within(prompt).getByText(/このブラウザに保存した記録は、ログインしたときに自動でアカウントへ移されます/)).toBeInTheDocument();
    expect(within(prompt).getByRole("button", { name: /ログインして続ける/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /撮影する/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /アルバムから選ぶ/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /手動で入力/ })).toBeEnabled();

    await user.click(within(prompt).getByRole("button", { name: "閉じる" }));
    expect(screen.queryByRole("region", { name: "お試しの読み取り（3回）を使い切りました" })).not.toBeInTheDocument();
  });

  it("使い切った状態で開いたら最初からログインを案内する", () => {
    renderHome({ enabled: true, remaining: 0 });
    expect(screen.getByRole("region", { name: "お試しの読み取り（3回）を使い切りました" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /撮影する/ })).toBeDisabled();
  });
});
