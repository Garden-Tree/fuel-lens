import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LatestRecordCard, { type LatestRecordCardProps } from "@/app/app/_components/LatestRecordCard";
import ManualEntryCard from "@/app/app/_components/ManualEntryCard";
import { useRecordForm } from "@/lib/useRecordForm";
import type { FuelRecord } from "@/lib/types";
import { renderWithProviders } from "../setup/render";

const RECORD: FuelRecord = {
  id: "r1",
  date: "2026-09-30",
  total_distance: 450,
  fuel_amount: 30,
  total_cost: 4800,
  price_per_unit: 160,
  fuel_efficiency: 15,
  gas_station: "ENEOS セルフ駅前",
  vehicle_id: "v1",
  odometer: 12345,
  is_full: true,
  missed_previous: false,
  fuel_type: "regular",
  memo: "高速道路を走行",
};

type HarnessProps = Omit<LatestRecordCardProps, "form" | "saving" | "onCancel" | "onSave">;

/** useRecordForm() をそのまま渡すハーネス（/app と同じ構成） */
function Harness(props: HarnessProps & { onCancel?: () => void; onSave?: () => void }) {
  const form = useRecordForm(props.record ?? null);
  return (
    <LatestRecordCard
      {...props}
      form={form}
      saving={false}
      onCancel={props.onCancel ?? (() => {})}
      onSave={props.onSave ?? (() => {})}
    />
  );
}

function setup(overrides: Partial<HarnessProps> = {}) {
  const props: HarnessProps = {
    record: RECORD,
    scanned: false,
    distanceMode: "trip",
    readOnly: false,
    isEditing: false,
    onEdit: vi.fn(),
    ...overrides,
  };
  const user = userEvent.setup();
  renderWithProviders(<Harness {...props} />);
  return { user, props };
}

describe("LatestRecordCard", () => {
  it("記録の値・バッジ・スタンド・メモを表示する", () => {
    setup();
    expect(screen.getByRole("heading", { name: "Latest Record" })).toBeInTheDocument();
    expect(screen.getByText("2026-09-30")).toBeInTheDocument();
    expect(screen.getByText("15.00")).toBeInTheDocument();
    expect(screen.getByText("¥4,800")).toBeInTheDocument();
    expect(screen.getByText("給油量")).toBeInTheDocument();
    expect(screen.getByText("走行距離")).toBeInTheDocument();
    expect(screen.getByText("ENEOS セルフ駅前")).toBeInTheDocument();
    expect(screen.getByText("レギュラー")).toBeInTheDocument();
    const memo = screen.getByTitle("高速道路を走行");
    expect(memo).toHaveTextContent("メモ: 高速道路を走行");
    // トリップモードでは ODO を出さない
    expect(screen.queryByText(/^ODO/)).not.toBeInTheDocument();
  });

  it("オドメーターモードでは「区間距離」と ODO を表示する", () => {
    setup({ distanceMode: "odometer" });
    expect(screen.getByText("区間距離")).toBeInTheDocument();
    expect(screen.getByText("ODO 12,345 km")).toBeInTheDocument();
  });

  it("燃費が無ければ理由と部分給油・記録漏れのバッジを表示する", () => {
    setup({ record: { ...RECORD, fuel_efficiency: null, is_full: false, missed_previous: true, fuel_type: null, memo: null } });
    expect(screen.getByText("--.--")).toBeInTheDocument();
    expect(screen.getByText("燃費: 部分給油（次の満タンで計算）")).toBeInTheDocument();
    expect(screen.getByText("部分給油")).toBeInTheDocument();
    expect(screen.getByText("記録漏れ")).toBeInTheDocument();
  });

  it("スキャン直後の記録は見出しを「Scanned Result」にする", () => {
    setup({ scanned: true });
    expect(screen.getByRole("heading", { name: "Scanned Result" })).toBeInTheDocument();
  });

  it("編集ボタンで onEdit に記録を渡す", async () => {
    const { user, props } = setup();
    await user.click(screen.getByRole("button", { name: "編集" }));
    expect(props.onEdit).toHaveBeenCalledWith(RECORD);
  });

  it("閲覧専用では編集ボタンを押せない", () => {
    setup({ readOnly: true });
    expect(screen.getByRole("button", { name: "編集" })).toBeDisabled();
  });

  it("編集中はフォームを表示し、編集ボタンは出さない", () => {
    setup({ isEditing: true });
    expect(screen.getByRole("heading", { name: "給油記録の編集" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "編集" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
  });

  it("記録が無ければ案内を表示する", () => {
    setup({ record: undefined });
    expect(screen.getByText("給油記録がまだありません")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "編集" })).not.toBeInTheDocument();
  });
});

describe("ManualEntryCard", () => {
  function ManualHarness() {
    const form = useRecordForm({ date: "2026-10-01" });
    return <ManualEntryCard form={form} saving={false} readOnly={false} onCancel={() => {}} onSave={() => {}} />;
  }

  it("見出し「New Record」と手動入力フォームを表示し、給油量か支払総額が入るまで保存できない", () => {
    renderWithProviders(<ManualHarness />);
    expect(screen.getByRole("heading", { name: "New Record" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "手動で記録を追加" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
    expect(screen.getByText("保存するには給油量または支払総額を入力してください")).toBeInTheDocument();
  });
});
