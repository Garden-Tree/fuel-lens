import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { act, render, screen } from "@testing-library/react";
import { InitialAuthProvider } from "@/lib/data/initialAuthContext";
import type { InitialAuth } from "@/lib/data/initialAuth";
import { useVehicleScope, type VehicleScope } from "@/lib/useVehicleScope";
import type { FuelRecord, Vehicle } from "@/lib/types";

// Clerk（clerk-js）の状態はテストごとに切り替える（最初は未読み込み）
const h = vi.hoisted(() => ({
  clerk: { isLoaded: false, isSignedIn: undefined as boolean | undefined, userId: undefined as string | null | undefined },
  getToken: async () => "token",
  /** クラウドの一覧の応答（resolve するまで待たせる） */
  cloud: {
    vehicles: [] as unknown[],
    records: [] as unknown[],
    gate: Promise.resolve() as Promise<void>,
  },
}));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ ...h.clerk, getToken: h.getToken }),
  useUser: () => ({ isLoaded: h.clerk.isLoaded, isSignedIn: h.clerk.isSignedIn, user: null }),
}));

// ネットワークに出ない: Supabase クライアント・初期化・生のクラウドストアを差し替える
vi.mock("@/lib/supabaseClient", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/supabaseClient")>()),
  getSupabaseClient: () => ({}),
}));
vi.mock("@/lib/data/cloudBootstrap", () => ({
  bootstrapCloud: async () => ({ migrationError: null, migrated: false }),
  forgetBootstrap: () => {},
}));
vi.mock("@/lib/data/cloudStore", async importOriginal => {
  const fail = async () => {
    throw new Error("not used");
  };
  return {
    ...(await importOriginal<typeof import("@/lib/data/cloudStore")>()),
    createCloudStores: () => ({
      vehicles: {
        list: async () => {
          await h.cloud.gate;
          return h.cloud.vehicles;
        },
        add: fail,
        addMany: fail,
        update: fail,
        remove: fail,
      },
      records: {
        list: async () => {
          await h.cloud.gate;
          return h.cloud.records;
        },
        listAll: fail,
        add: fail,
        addMany: fail,
        update: fail,
        remove: fail,
        removeByVehicle: fail,
      },
    }),
  };
});

const V1 = "11111111-1111-4111-8111-111111111111";
const VEHICLE: Vehicle = { id: V1, user_id: "u1", name: "クラウドの車", type: "car", distance_mode: "trip", default_fuel_type: null };
const record = (id: string, station: string, vehicle_id: string | null): FuelRecord => ({
  id,
  date: "2026-10-01",
  total_distance: 400,
  fuel_amount: 25,
  total_cost: 4000,
  price_per_unit: 160,
  fuel_efficiency: 16,
  gas_station: station,
  vehicle_id,
});

/** 描画のたびに loading を記録する（スケルトンに戻ったかの確認用） */
const loadingLog: boolean[] = [];
const probe: { latest: VehicleScope | null } = { latest: null };

function Probe() {
  const scope = useVehicleScope();
  useEffect(() => {
    probe.latest = scope;
    loadingLog.push(scope.loading);
  });
  if (scope.loading) return <p>loading</p>;
  return (
    <div>
      <p data-testid="vehicles">{scope.vehicles.map(v => v.name).join(",")}</p>
      <p data-testid="stations">{scope.records.map(r => r.gas_station).join(",")}</p>
      <p data-testid="state">{`previewing=${scope.previewing} readOnly=${scope.readOnly}`}</p>
    </div>
  );
}

const tree = (initial: InitialAuth | null) => (
  <InitialAuthProvider value={initial}>
    <Probe />
  </InitialAuthProvider>
);

/** 読み込みの effect と非同期処理を流し切る */
const settle = () => act(() => new Promise<void>(resolve => setTimeout(resolve, 20)));

function setClerk(state: { isSignedIn: boolean; userId: string | null } | null) {
  h.clerk = state ? { isLoaded: true, ...state } : { isLoaded: false, isSignedIn: undefined, userId: undefined };
}

describe("サーバーの初期認証状態による先行描画（Clerk の読み込み前）", () => {
  let openGate: () => void = () => {};

  beforeEach(() => {
    setClerk(null);
    loadingLog.length = 0;
    probe.latest = null;
    h.cloud.vehicles = [VEHICLE];
    h.cloud.records = [record("n1", "クラウドのスタンド", V1)];
    h.cloud.gate = new Promise<void>(resolve => {
      openGate = resolve;
    });
    localStorage.clear();
    // 未ログイン時のローカルのデータ（未分類の記録 = 既定車両に表示）
    localStorage.setItem("fuel_lens_data", JSON.stringify([record("l1", "ローカルのスタンド", null)]));
    // ログイン中のユーザー u1 のキャッシュ
    localStorage.setItem("fuel_lens_cache_vehicles_u1", JSON.stringify([VEHICLE]));
    localStorage.setItem(`fuel_lens_cache_records_u1_${V1}`, JSON.stringify([record("c1", "キャッシュのスタンド", V1)]));
  });
  afterEach(() => {
    openGate();
    localStorage.clear();
    document.cookie = "__client_uat=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  });

  it("サーバーが未ログイン（Cookie も未ログイン）なら Clerk を待たずにローカルのデータを表示する", async () => {
    render(tree({ signedIn: false, userId: null }));
    expect(await screen.findByTestId("stations")).toHaveTextContent("ローカルのスタンド");
    expect(screen.getByTestId("state")).toHaveTextContent("previewing=false readOnly=false");
  });

  it("サーバーが未ログインでも Clerk の Cookie がログイン中かもしれないなら、ローカルを使わず Clerk を待つ", async () => {
    document.cookie = "__client_uat=1700000000; path=/";
    render(tree({ signedIn: false, userId: null }));
    await settle();
    expect(screen.getByText("loading")).toBeInTheDocument();
    expect(screen.queryByTestId("stations")).not.toBeInTheDocument();
  });

  it("サーバーが未ログイン → Clerk がログイン中と言えばクラウドへ切り替わる", async () => {
    const initial = { signedIn: false, userId: null };
    const { rerender } = render(tree(initial));
    expect(await screen.findByTestId("stations")).toHaveTextContent("ローカルのスタンド");
    setClerk({ isSignedIn: true, userId: "u1" });
    rerender(tree(initial));
    openGate();
    await settle();
    expect(screen.getByTestId("stations")).toHaveTextContent("クラウドのスタンド");
    expect(screen.getByTestId("stations")).not.toHaveTextContent("ローカル");
    expect(screen.getByTestId("vehicles")).toHaveTextContent("クラウドの車");
  });

  it("キャッシュの持ち主が一致すれば閲覧専用で先に表示し、書き込みはストアの準備前として日本語エラーで拒否する", async () => {
    localStorage.setItem("fuel_lens_cache_owner", "u1");
    render(tree({ signedIn: true, userId: "u1" }));
    expect(await screen.findByTestId("stations")).toHaveTextContent("キャッシュのスタンド");
    expect(screen.getByTestId("vehicles")).toHaveTextContent("クラウドの車");
    expect(screen.getByTestId("stations")).not.toHaveTextContent("ローカル");
    expect(screen.getByTestId("state")).toHaveTextContent("previewing=true readOnly=true");

    const input = { date: "2026-10-02", total_distance: 300, fuel_amount: 20, total_cost: 3200, price_per_unit: 160, fuel_efficiency: 15, gas_station: "" };
    await expect(probe.latest!.recordActions.addRecord(input)).rejects.toThrow(
      "ログイン情報を確認できませんでした"
    );
    await expect(probe.latest!.vehicleActions.addVehicle("新しい車", "car")).rejects.toThrow("ログイン情報を確認できませんでした");
  });

  describe("キャッシュの先行表示から Clerk の読み込み後へ", () => {
    const initial = { signedIn: true, userId: "u1" };
    const startPreview = async () => {
      localStorage.setItem("fuel_lens_cache_owner", "u1");
      const view = render(tree(initial));
      expect(await screen.findByTestId("stations")).toHaveTextContent("キャッシュのスタンド");
      loadingLog.length = 0;
      return view;
    };

    it("同じユーザーなら、スケルトンに戻さずに最新の一覧へ置き換え、先行表示を終える", async () => {
      const { rerender } = await startPreview();
      setClerk({ isSignedIn: true, userId: "u1" });
      rerender(tree(initial));
      await settle();
      // 応答待ちの間もキャッシュを表示したまま（書き込みはまだできない）
      expect(screen.getByTestId("stations")).toHaveTextContent("キャッシュのスタンド");
      expect(screen.getByTestId("state")).toHaveTextContent("previewing=true readOnly=true");
      openGate();
      await settle();
      expect(screen.getByTestId("stations")).toHaveTextContent("クラウドのスタンド");
      expect(screen.getByTestId("state")).toHaveTextContent("previewing=false readOnly=false");
      expect(loadingLog).not.toContain(true);
    });

    it("Clerk が未ログインと言えば、キャッシュをすぐ消してローカルのデータに切り替える", async () => {
      const { rerender } = await startPreview();
      setClerk({ isSignedIn: false, userId: null });
      rerender(tree(initial));
      await settle();
      expect(screen.getByTestId("stations")).toHaveTextContent("ローカルのスタンド");
      expect(screen.getByTestId("stations")).not.toHaveTextContent("キャッシュ");
      expect(screen.getByTestId("state")).toHaveTextContent("previewing=false readOnly=false");
    });

    it("Clerk が別のユーザーと言えば、応答を待たずにキャッシュを消して読み込み中にする", async () => {
      const { rerender } = await startPreview();
      setClerk({ isSignedIn: true, userId: "u2" });
      rerender(tree(initial));
      await settle();
      expect(screen.getByText("loading")).toBeInTheDocument();
      expect(screen.queryByText(/キャッシュのスタンド/)).not.toBeInTheDocument();
      expect(probe.latest!.previewing).toBe(false);
    });
  });

  it("キャッシュの持ち主が違えば何も出さず、Clerk を待つ（ローカルのデータも出さない）", async () => {
    localStorage.setItem("fuel_lens_cache_owner", "u2");
    render(tree({ signedIn: true, userId: "u1" }));
    await settle();
    expect(screen.getByText("loading")).toBeInTheDocument();
    expect(screen.queryByTestId("stations")).not.toBeInTheDocument();
  });

  it("サーバーの状態が不明なら従来どおり Clerk を待つ", async () => {
    localStorage.setItem("fuel_lens_cache_owner", "u1");
    render(tree(null));
    await settle();
    expect(screen.getByText("loading")).toBeInTheDocument();
    expect(screen.queryByTestId("stations")).not.toBeInTheDocument();
  });
});
