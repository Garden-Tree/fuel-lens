import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LatestRecordCard, { type LatestRecordCardProps } from "@/app/app/_components/LatestRecordCard";
import ManualEntryCard from "@/app/app/_components/ManualEntryCard";
import MonthSummarySection from "@/app/app/_components/MonthSummarySection";
import RecentRecordsSection from "@/app/app/_components/RecentRecordsSection";
import { useRecordForm } from "@/lib/useRecordForm";
import { localDateString } from "@/lib/dates";
import type { FuelRecord } from "@/lib/types";
import { renderWithProviders } from "../setup/render";

const RECORD: FuelRecord = {
  id: "r2",
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
  run_distance: 450,
  run_fuel: 30,
};

const OLDER: FuelRecord = {
  ...RECORD,
  id: "r1",
  date: "2026-09-10",
  total_distance: 400,
  fuel_amount: 32,
  fuel_efficiency: 12.5,
  gas_station: null,
  fuel_type: "premium",
  total_cost: 5000,
  run_distance: 400,
  run_fuel: 32,
};

type HarnessProps = Omit<LatestRecordCardProps, "form" | "saving" | "onCancel" | "onSave">;

/** useRecordForm() をそのまま渡すハーネス（/app と同じ構成） */
function Harness(props: HarnessProps & { onCancel?: () => void; onSave?: () => void }) {
  const form = useRecordForm(props.record);
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
    records: [RECORD, OLDER],
    scanned: false,
    justSaved: false,
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
  it("前回の燃費のメーター・日付と店舗・前回比・平均を表示する", () => {
    setup();
    expect(screen.getByRole("heading", { name: "前回の燃費" })).toBeInTheDocument();
    expect(screen.getByText("9/30")).toBeInTheDocument();
    expect(screen.getByText(/ENEOS セルフ駅前/)).toBeInTheDocument();
    expect(screen.getByText("15.00")).toBeInTheDocument();
    expect(screen.getByText("km/L")).toBeInTheDocument();
    // 前回比: 15.00 − 12.50 = ▲ 2.50（向上）
    expect(screen.getByText("2.50")).toBeInTheDocument();
    expect(screen.getByText("▲")).toBeInTheDocument();
    expect(screen.getByText("（前回より向上）")).toBeInTheDocument();
    // 平均 = 850 km ÷ 62 L = 13.71
    expect(screen.getByText("13.71")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "燃費メーター。15.00 km/L、平均 13.71 km/L" })).toBeInTheDocument();
  });

  it("悪化は ▼ で示す", () => {
    const worse = { ...OLDER, id: "r3", date: "2026-10-05", fuel_efficiency: 11, run_distance: 330, run_fuel: 30 };
    setup({ record: worse, records: [worse, RECORD, OLDER] });
    expect(screen.getByText("▼")).toBeInTheDocument();
    expect(screen.getByText("4.00")).toBeInTheDocument();
    expect(screen.getByText("（前回より悪化）")).toBeInTheDocument();
  });

  it("最新が部分給油なら燃費の出ている直近の記録をメーターに出し、最新は注記で知らせる", () => {
    const partial: FuelRecord = { ...RECORD, id: "p", date: "2026-10-01", fuel_efficiency: null, is_full: false, run_distance: undefined, run_fuel: undefined };
    setup({ record: partial, records: [partial, RECORD, OLDER] });
    expect(screen.getByText(/は部分給油（次の満タンで計算）/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /^燃費メーター。\d/ })).toBeInTheDocument();
  });

  it("燃費の出ている記録が無い部分給油だけなら、数値の代わりに理由を出し前回比は出さない", () => {
    const partial: FuelRecord = { ...RECORD, id: "p", date: "2026-10-01", fuel_efficiency: null, is_full: false, run_distance: undefined, run_fuel: undefined };
    setup({ record: partial, records: [partial] });
    expect(screen.getByText("部分給油")).toBeInTheDocument();
    expect(screen.getByText("次の満タンで計算")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "燃費メーター。部分給油（次の満タンで計算）" })).toBeInTheDocument();
    expect(screen.queryByText("前回比")).not.toBeInTheDocument();
  });

  it("手動入力で保存した直後の部分給油は、別の記録に差し替えずにそのまま出す", () => {
    const partial: FuelRecord = { ...RECORD, id: "p", date: "2026-10-01", fuel_efficiency: null, is_full: false, run_distance: undefined, run_fuel: undefined };
    setup({ record: partial, records: [partial, RECORD, OLDER], justSaved: true });
    expect(screen.getByRole("heading", { name: "前回の燃費" })).toBeInTheDocument();
    expect(screen.queryByText(/は部分給油（次の満タンで計算）/)).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "燃費メーター。部分給油（次の満タンで計算）" })).toBeInTheDocument();
  });

  it("スキャン直後の記録は見出しを「スキャンした記録」にする", () => {
    setup({ scanned: true, justSaved: true });
    expect(screen.getByRole("heading", { name: "スキャンした記録" })).toBeInTheDocument();
  });

  it("編集ボタンで onEdit に記録を渡す。閲覧専用では押せない", async () => {
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
});

describe("ManualEntryCard", () => {
  function ManualHarness() {
    const form = useRecordForm({ date: "2026-10-01" });
    return <ManualEntryCard form={form} saving={false} readOnly={false} onCancel={() => {}} onSave={() => {}} />;
  }

  it("見出し「手動で記録を追加」と手動入力フォームを表示し、給油量か支払総額が入るまで保存できない", () => {
    renderWithProviders(<ManualHarness />);
    expect(screen.getByRole("heading", { name: "手動で記録を追加" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
    expect(screen.getByText("保存するには給油量または支払総額を入力してください")).toBeInTheDocument();
  });
});

describe("MonthSummarySection", () => {
  it("今月の給油代・給油量（回数）・単価を表示する", () => {
    const today = new Date();
    const thisMonth = { ...RECORD, date: localDateString(today), total_cost: 4920, fuel_amount: 29.11, price_per_unit: 169 };
    const prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 10);
    const older = { ...OLDER, date: localDateString(prevMonth), price_per_unit: 168 };
    renderWithProviders(<MonthSummarySection records={[thisMonth, older]} />);
    expect(screen.getByRole("heading", { name: `${today.getMonth() + 1}月` })).toBeInTheDocument();
    expect(screen.getByText("¥4,920")).toBeInTheDocument();
    expect(screen.getByText("29.11")).toBeInTheDocument();
    expect(screen.getByText("L・1回", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("¥169.0")).toBeInTheDocument();
    expect(screen.getByText("+1.0")).toBeInTheDocument();
  });

  it("今月の記録が無ければ案内を出す", () => {
    renderWithProviders(<MonthSummarySection records={[{ ...OLDER, date: "2000-01-01" }]} />);
    expect(screen.getByText("この月の給油記録はまだありません")).toBeInTheDocument();
  });
});

describe("RecentRecordsSection", () => {
  it("新しい順に 3 件まで、店舗名・日付・燃料種別・金額と燃費（部分給油はバッジ）を出し、履歴へリンクする", () => {
    const partial: FuelRecord = { ...RECORD, id: "p", date: "2026-10-02", fuel_efficiency: null, is_full: false, gas_station: "コスモ石油" };
    const oldest: FuelRecord = { ...OLDER, id: "r0", date: "2026-08-01" };
    renderWithProviders(<RecentRecordsSection records={[partial, RECORD, OLDER, oldest]} />);
    expect(screen.getByRole("heading", { name: "最近の記録" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "すべて見る" })).toHaveAttribute("href", "/history");
    const rows = screen.getAllByRole("link").filter(a => a.textContent !== "すべて見る");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("コスモ石油");
    expect(rows[0]).toHaveTextContent("部分給油");
    expect(rows[1]).toHaveTextContent("ENEOS セルフ駅前");
    expect(rows[1]).toHaveTextContent("9月30日・レギュラー・¥4,800");
    expect(rows[1]).toHaveTextContent("15.00");
    expect(rows[2]).toHaveTextContent("店舗名なし");
    expect(rows[2]).toHaveTextContent("9月10日・ハイオク・¥5,000");
    // 各行は履歴の該当記録を開くディープリンク（/history#record-<id>）
    expect(rows.map(row => row.getAttribute("href"))).toEqual([
      "/history#record-p",
      `/history#record-${RECORD.id}`,
      `/history#record-${OLDER.id}`,
    ]);
  });
});
