import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "@/app/(app)/app/page";
import BatchScanCard from "@/app/(app)/app/_components/BatchScanCard";
import ScanPanel, { type ScanPanelProps } from "@/app/(app)/app/_components/ScanPanel";
import ScanReviewSheet, { BATCH_DATE_MISSING_NOTE } from "@/components/ScanReviewSheet";
import type { AnalyzeSuccessResponse } from "@/lib/analyze";
import type { AnalyzeHttpResult } from "@/lib/scan/analyzeClient";
import { BATCH_BLOCKED_MESSAGES, BATCH_SIGNED_OUT_MESSAGE, POSSIBLE_DUPLICATE_MESSAGE } from "@/lib/scan/batch";
import type { BatchItem, BatchState } from "@/lib/scan/batchController";
import type { FuelRecord, RecordInput, Vehicle } from "@/lib/types";
import type { VehicleScope } from "@/lib/useVehicleScope";
import { todayLocalISO } from "@/lib/dates";
import { renderWithProviders } from "../setup/render";

// ---- モック --------------------------------------------------------------

const auth = vi.hoisted(() => ({ signedIn: true }));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: auth.signedIn,
    userId: auth.signedIn ? "u1" : null,
    getToken: async () => (auth.signedIn ? "t" : null),
  }),
  useUser: () => ({ isLoaded: true, isSignedIn: auth.signedIn, user: null }),
  SignedIn: ({ children }: { children?: ReactNode }) => (auth.signedIn ? createElement("div", null, children) : null),
  SignedOut: ({ children }: { children?: ReactNode }) => (auth.signedIn ? null : createElement("div", null, children)),
  SignInButton: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
  UserButton: () => createElement("div", { "data-testid": "user-button" }),
}));

const api = vi.hoisted(() => ({
  compressToDataUrl: vi.fn(),
  requestAnalyze: vi.fn(),
}));
vi.mock("@/lib/scan/analyzeClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/scan/analyzeClient")>()),
  compressToDataUrl: api.compressToDataUrl,
  requestAnalyze: api.requestAnalyze,
}));

const VEHICLE: Vehicle = { id: "v1", user_id: "u1", name: "マイカー", type: "car", distance_mode: "trip", default_fuel_type: null };
// 一括読み取りの 1 枚目と同じ日付・金額の記録
const EXISTING: FuelRecord = {
  id: "r1",
  date: "2025-03-01",
  total_distance: 450,
  fuel_amount: 30,
  total_cost: 4800,
  price_per_unit: 160,
  fuel_efficiency: 15,
  gas_station: "ENEOS",
  vehicle_id: "v1",
};
const RECORDS = [EXISTING];

const scopeState = vi.hoisted(() => ({
  readOnly: false,
  addRecord: vi.fn(),
}));
vi.mock("@/lib/useVehicleScope", () => ({
  useVehicleScope: (): VehicleScope =>
    ({
      vehicles: [VEHICLE],
      selectedVehicleId: "v1",
      setSelectedVehicleId: vi.fn(),
      selectedVehicle: VEHICLE,
      distanceMode: "trip",
      defaultVehicleId: "v1",
      records: RECORDS,
      loading: false,
      vehiclesLoading: false,
      recordsLoading: false,
      error: null,
      readOnly: scopeState.readOnly,
      previewing: false,
      outage: null,
      scopeKey: "v1:trip",
      vehicleActions: { addVehicle: vi.fn(), addVehicles: vi.fn(), updateVehicle: vi.fn(), deleteVehicle: vi.fn() },
      recordActions: {
        addRecord: scopeState.addRecord,
        addRecords: vi.fn(),
        updateRecord: vi.fn(),
        deleteRecord: vi.fn(),
        fetchAllRecords: vi.fn(),
        refresh: vi.fn(),
      },
    }) as unknown as VehicleScope,
}));

// ---- ヘルパー -------------------------------------------------------------

function analyzeResult(overrides: Partial<AnalyzeSuccessResponse> = {}): AnalyzeSuccessResponse {
  return {
    date: "2025-01-05",
    fuel_amount: 20,
    total_cost: 3200,
    price_per_unit: 160,
    total_distance: 300,
    odometer: null,
    gas_station: null,
    fuel_type: null,
    confidence: { date: 0.9, fuel_amount: 0.9, total_cost: 0.9, total_distance: 0.9, gas_station: 0.9 },
    requestId: "req",
    ...overrides,
  };
}

const okResponse = (body: AnalyzeSuccessResponse): AnalyzeHttpResult => ({ ok: true, status: 200, body, retryAfter: null, trialRemaining: null });
const photo = (name: string) => new File(["x"], name, { type: "image/jpeg" });

function item(overrides: Partial<BatchItem>): BatchItem {
  return { index: 0, status: "pending", dataUrl: null, result: null, error: null, waitMs: 0, ...overrides };
}

// ---- 状態カード --------------------------------------------------------------

describe("BatchScanCard", () => {
  const stateOf = (current: BatchItem, index = 2, total = 12): BatchState => ({
    items: Array.from({ length: total }, (_, i) =>
      i === index ? { ...current, index } : item({ index: i, status: i < index ? (i === 0 ? "skipped" : "saved") : "pending" })
    ),
    current: index,
    phase: "running",
  });

  it("進み具合（「3 / 12 枚目」）と回数制限の待ち時間を表示し、読み上げは秒数を含まない", () => {
    renderWithProviders(
      <BatchScanCard state={stateOf(item({ status: "waiting", waitMs: 2500 }))} onSkip={vi.fn()} onAbort={vi.fn()} />
    );
    const card = screen.getByRole("region", { name: "写真の一括読み取り" });
    expect(within(card).getByText("3 / 12 枚目")).toBeInTheDocument();
    expect(within(card).getByText("読み取りの回数制限のため、あと 3 秒待っています")).toBeInTheDocument();
    const live = within(card).getByRole("status");
    expect(live).toHaveAttribute("aria-live", "polite");
    expect(live).toHaveTextContent("3 / 12 枚目: 読み取りの回数制限のため待っています");
    expect(within(card).getByText("保存 1 件・スキップ 1 件")).toBeInTheDocument();
  });

  it("「この写真をスキップ」「残りを中止」を押せる", async () => {
    const user = userEvent.setup();
    const onSkip = vi.fn();
    const onAbort = vi.fn();
    renderWithProviders(<BatchScanCard state={stateOf(item({ status: "analyzing" }))} onSkip={onSkip} onAbort={onAbort} />);
    expect(screen.getByText("AIが解析中...")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "この写真をスキップ" }));
    await user.click(screen.getByRole("button", { name: "残りを中止" }));
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onAbort).toHaveBeenCalledTimes(1);
  });
});

// ---- 確認シート（一括読み取り） ------------------------------------------------

describe("ScanReviewSheet（一括読み取り）", () => {
  function setup(result: AnalyzeSuccessResponse, batch: { index?: number; total?: number; readError?: string | null } = {}) {
    const onSave = vi.fn<(r: RecordInput) => Promise<void>>().mockResolvedValue(undefined);
    const onDiscard = vi.fn();
    const onAbort = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <ScanReviewSheet
        result={result}
        imageSrc="data:image/jpeg;base64,AAAA"
        vehicle={VEHICLE}
        records={RECORDS}
        onSave={onSave}
        onDiscard={onDiscard}
        batch={{ index: batch.index ?? 0, total: batch.total ?? 3, readError: batch.readError ?? null, onAbort }}
      />
    );
    return { user, onSave, onDiscard, onAbort };
  }

  it("進み具合と「保存して次へ / この写真をスキップ / 残りを中止」を出す", async () => {
    const { user, onDiscard, onAbort } = setup(analyzeResult(), { index: 1, total: 3 });
    expect(screen.getByText("2 / 3 枚目")).toBeInTheDocument();
    // シートが開くたびに、何枚目かもダイアログ名として読み上げる
    expect(screen.getByRole("dialog", { name: /読み取り結果の確認.*2 \/ 3 枚目/ })).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "一括読み取りの進み具合" })).toHaveAttribute("aria-valuenow", "2");
    expect(screen.getByRole("button", { name: /保存して次へ/ })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: /この写真をスキップ/ }));
    await user.click(screen.getByRole("button", { name: /残りを中止/ }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onAbort).toHaveBeenCalledTimes(1);
  });

  it("最後の 1 枚は「保存して終了」", () => {
    setup(analyzeResult(), { index: 2, total: 3 });
    expect(screen.getByRole("button", { name: /保存して終了/ })).toBeInTheDocument();
  });

  it("日付が読めなければ今日を入れず、空のまま要確認にして保存できないようにする", async () => {
    const { user, onSave } = setup(analyzeResult({ date: null }));
    const date = screen.getByLabelText(/給油日/);
    expect(date).toHaveValue("");
    expect(date).not.toHaveValue(todayLocalISO());
    expect(screen.getByText(BATCH_DATE_MISSING_NOTE)).toBeInTheDocument();
    expect(screen.getByText("日付を入力してください")).toBeInTheDocument();
    const save = screen.getByRole("button", { name: /保存して次へ/ });
    expect(save).toBeDisabled();

    fireEvent.change(date, { target: { value: "2025-02-01" } });
    expect(screen.queryByText(BATCH_DATE_MISSING_NOTE)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /保存して次へ/ }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ date: "2025-02-01", total_cost: 3200 }));
  });

  it("距離が読めなければ（レシートだけの写真）、入力を促しつつ未入力でも保存できる", async () => {
    const { user, onSave } = setup(analyzeResult({ total_distance: null }));
    expect(screen.getByText(/走行距離（トリップメーター）を読み取れませんでした/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /保存して次へ/ }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ total_distance: null }));
  });

  it("同じ日付・金額の記録がすでにあれば注意を出す（入力を直せば消える）", async () => {
    const { user } = setup(analyzeResult({ date: "2025-03-01", total_cost: 4800, fuel_amount: 30 }));
    expect(screen.getByText(POSSIBLE_DUPLICATE_MESSAGE)).toBeInTheDocument();
    await user.clear(screen.getByLabelText("支払総額 (円)"));
    await user.type(screen.getByLabelText("支払総額 (円)"), "4900");
    expect(screen.queryByText(POSSIBLE_DUPLICATE_MESSAGE)).not.toBeInTheDocument();
  });

  it("読み取れなかった写真は理由を出し、写真を拡大して見ながら入力できる", async () => {
    const { user } = setup(
      { ...analyzeResult(), date: null, fuel_amount: null, total_cost: null, total_distance: null, price_per_unit: null },
      { readError: "レシート/メーターを読み取れませんでした。" }
    );
    expect(screen.getByText("この写真は読み取れませんでした")).toBeInTheDocument();
    expect(screen.getByText("レシート/メーターを読み取れませんでした。")).toBeInTheDocument();
    // 写真は最初から大きく出ている。タップでさらに大きくできる
    expect(screen.getByRole("img", { name: "解析した写真" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "写真を拡大する" }));
    expect(screen.getByRole("button", { name: "写真を縮小する" })).toHaveAttribute("aria-expanded", "true");
  });
});

// ---- アルバムの複数選択 ------------------------------------------------------

describe("ScanPanel（複数選択）", () => {
  function setup(overrides: Partial<ScanPanelProps> = {}) {
    const props: ScanPanelProps = {
      scanning: false,
      loadingStep: null,
      preview: null,
      sharedPending: null,
      readOnly: false,
      onSelectFile: vi.fn(),
      onSelectFiles: vi.fn(),
      onClearPreview: vi.fn(),
      onAnalyzeShared: vi.fn(),
      onManualEntry: vi.fn(),
      ...overrides,
    };
    renderWithProviders(<ScanPanel {...props} />);
    return { props, user: userEvent.setup() };
  }

  it("アルバムは複数選択でき、2 枚以上なら onSelectFiles、1 枚なら onSelectFile に渡す", async () => {
    const { props, user } = setup();
    const album = screen.getByLabelText("画像ファイルを選択");
    expect(album).toHaveAttribute("multiple");
    expect(screen.getByLabelText("カメラで撮影")).not.toHaveAttribute("multiple");

    const files = [photo("a.jpg"), photo("b.jpg")];
    await user.upload(album, files);
    expect(props.onSelectFiles).toHaveBeenCalledWith(files);
    expect(props.onSelectFile).not.toHaveBeenCalled();

    await user.upload(album, photo("c.jpg"));
    expect(props.onSelectFile).toHaveBeenCalledTimes(1);
  });

  it("onSelectFiles が無ければ複数選択にしない", () => {
    setup({ onSelectFiles: undefined });
    expect(screen.getByLabelText("画像ファイルを選択")).not.toHaveAttribute("multiple");
  });
});

// ---- ホームでの一括読み取りの流れ ----------------------------------------------

describe("ホーム（/app）の一括読み取り", () => {
  let added = 0;
  beforeEach(() => {
    auth.signedIn = true;
    scopeState.readOnly = false;
    added = 0;
    scopeState.addRecord.mockReset();
    scopeState.addRecord.mockImplementation(async (record: RecordInput) => {
      added += 1;
      return { ...record, id: `new-${added}`, vehicle_id: "v1" };
    });
    api.compressToDataUrl.mockReset();
    api.compressToDataUrl.mockImplementation(async (file: File) => `data:image/jpeg;base64,${file.name}`);
    api.requestAnalyze.mockReset();
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const album = () => screen.getByLabelText("画像ファイルを選択");

  it("複数の写真を順に確認し、スキップ・保存して、最後に結果を知らせる", async () => {
    const user = userEvent.setup();
    const results: Record<string, AnalyzeSuccessResponse> = {
      "data:image/jpeg;base64,a.jpg": analyzeResult({ date: "2025-03-01", total_cost: 4800, fuel_amount: 30 }),
      "data:image/jpeg;base64,b.jpg": analyzeResult({ date: null, total_cost: 3000 }),
      "data:image/jpeg;base64,c.jpg": analyzeResult({ date: "2025-01-05", total_cost: 3200 }),
    };
    api.requestAnalyze.mockImplementation(async (dataUrl: string) => okResponse(results[dataUrl]));
    renderWithProviders(<Home />);

    await user.upload(album(), [photo("a.jpg"), photo("b.jpg"), photo("c.jpg")]);

    // 1 枚目: 既存の記録と同じ日付・金額 → 注意を見てスキップ
    let sheet = await screen.findByRole("dialog", { name: /^読み取り結果の確認/ });
    expect(within(sheet).getByText("1 / 3 枚目")).toBeInTheDocument();
    expect(within(sheet).getByText(POSSIBLE_DUPLICATE_MESSAGE)).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: /この写真をスキップ/ }));

    // 2 枚目: 日付が読めない → 今日を入れず、入力するまで保存できない
    sheet = await screen.findByRole("dialog", { name: /^読み取り結果の確認/ });
    expect(await within(sheet).findByText("2 / 3 枚目")).toBeInTheDocument();
    const date = within(sheet).getByLabelText(/給油日/);
    expect(date).toHaveValue("");
    expect(within(sheet).getByRole("button", { name: /保存して次へ/ })).toBeDisabled();
    fireEvent.change(date, { target: { value: "2025-02-01" } });
    await user.click(within(sheet).getByRole("button", { name: /保存して次へ/ }));

    // 3 枚目: そのまま保存して終了
    sheet = await screen.findByRole("dialog", { name: /^読み取り結果の確認/ });
    expect(await within(sheet).findByText("3 / 3 枚目")).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: /保存して終了/ }));

    expect(await screen.findByText("3 枚中 2 件を保存、1 件をスキップしました")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: /^読み取り結果の確認/ })).not.toBeInTheDocument();
    expect(scopeState.addRecord).toHaveBeenCalledTimes(2);
    expect(scopeState.addRecord.mock.calls.map((c) => (c[0] as RecordInput).date)).toEqual(["2025-02-01", "2025-01-05"]);
    // 記録の入口（計測用）は一括読み取り
    expect(scopeState.addRecord.mock.calls.map((c) => (c[0] as RecordInput).source)).toEqual(["batch", "batch"]);
    expect(api.requestAnalyze).toHaveBeenCalledTimes(3);
  });

  it("「残りを中止」は確認してから止め、保存した件数を知らせる", async () => {
    const user = userEvent.setup();
    api.requestAnalyze.mockImplementation(async () => okResponse(analyzeResult()));
    renderWithProviders(<Home />);
    await user.upload(album(), [photo("a.jpg"), photo("b.jpg"), photo("c.jpg"), photo("d.jpg")]);

    const sheet = await screen.findByRole("dialog", { name: /^読み取り結果の確認/ });
    await user.click(within(sheet).getByRole("button", { name: /残りを中止/ }));
    const confirm = await screen.findByRole("dialog", { name: "確認" });
    expect(within(confirm).getByText("残りの 4 枚の読み取りを中止しますか？表示中の読み取り結果は保存されません。")).toBeInTheDocument();
    await user.click(within(confirm).getByRole("button", { name: "中止する" }));

    expect(await screen.findByText("4 枚中 0 件を保存し、残りの 4 枚は中止しました")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: /^読み取り結果の確認/ })).not.toBeInTheDocument();
    // 先読みは 1 枚先まで
    expect(api.requestAnalyze.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("21 枚以上選ばれたら上限を伝え、最初の 20 枚だけ読み取る", async () => {
    const user = userEvent.setup();
    api.requestAnalyze.mockImplementation(async () => okResponse(analyzeResult()));
    renderWithProviders(<Home />);
    await user.upload(album(), Array.from({ length: 22 }, (_, i) => photo(`p${i}.jpg`)));
    expect(await screen.findByText(/一度に読み取れるのは 20 枚までです/)).toBeInTheDocument();
    const sheet = await screen.findByRole("dialog", { name: /^読み取り結果の確認/ });
    expect(within(sheet).getByText("1 / 20 枚目")).toBeInTheDocument();
  });

  it("未ログインでは解析を呼ばずに、ログインが必要なことを伝える（ドロップ）", async () => {
    auth.signedIn = false;
    renderWithProviders(<Home />);
    const dropTarget = screen.getByText("画像のドロップ・貼り付けによる読み取りはログイン後に使えます");
    fireEvent.drop(dropTarget, { dataTransfer: { files: [photo("a.jpg"), photo("b.jpg")], items: [] } });
    expect(await screen.findByText(BATCH_SIGNED_OUT_MESSAGE)).toBeInTheDocument();
    expect(api.compressToDataUrl).not.toHaveBeenCalled();
    expect(api.requestAnalyze).not.toHaveBeenCalled();
  });

  it("ちょうど 2 枚を選ぶと読み取り方を聞き、「2件の給油として一括で読む」で一括読み取りにする", async () => {
    const user = userEvent.setup();
    api.requestAnalyze.mockImplementation(async () => okResponse(analyzeResult()));
    renderWithProviders(<Home />);
    await user.upload(album(), [photo("a.jpg"), photo("b.jpg")]);

    const chooser = await screen.findByRole("dialog", { name: "2枚の写真をどう読み取りますか？" });
    expect(api.requestAnalyze).not.toHaveBeenCalled();
    await user.click(within(chooser).getByRole("button", { name: /2件の給油として一括で読む/ }));

    const sheet = await screen.findByRole("dialog", { name: /^読み取り結果の確認/ });
    expect(within(sheet).getByText("1 / 2 枚目")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "2枚の写真をどう読み取りますか？" })).not.toBeInTheDocument();
  });

  it("2 枚の読み取り方の選択で「キャンセル」なら何も読み取らない", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Home />);
    await user.upload(album(), [photo("a.jpg"), photo("b.jpg")]);
    const chooser = await screen.findByRole("dialog", { name: "2枚の写真をどう読み取りますか？" });
    await user.click(within(chooser).getByRole("button", { name: "キャンセル" }));
    expect(screen.queryByRole("dialog", { name: "2枚の写真をどう読み取りますか？" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: /^読み取り結果の確認/ })).not.toBeInTheDocument();
    expect(api.compressToDataUrl).not.toHaveBeenCalled();
    expect(api.requestAnalyze).not.toHaveBeenCalled();
  });

  it("閲覧専用（障害中）では一括読み取りを始めない", async () => {
    scopeState.readOnly = true;
    const user = userEvent.setup();
    renderWithProviders(<Home />);
    await user.upload(album(), [photo("a.jpg"), photo("b.jpg")]);
    expect(await screen.findByText(BATCH_BLOCKED_MESSAGES.readOnly)).toBeInTheDocument();
    expect(api.requestAnalyze).not.toHaveBeenCalled();
  });
});
