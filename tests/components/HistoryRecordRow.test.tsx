import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import RecordRow from "@/app/history/_components/RecordRow";
import RecordDetail, { type RecordDetailProps } from "@/app/history/_components/RecordDetail";
import type { DistanceMode, FuelRecord } from "@/lib/types";
import { renderWithProviders } from "../setup/render";

const RECORD: FuelRecord = {
  id: "r1",
  date: "2026-09-11",
  total_distance: 440.2,
  fuel_amount: 29.11,
  total_cost: 4920,
  price_per_unit: 169,
  fuel_efficiency: 15.12,
  gas_station: "コスモ石油 セルフピュア世田谷",
  vehicle_id: "v1",
  odometer: 12345,
  is_full: true,
  missed_previous: false,
  fuel_type: "premium",
  memo: "高速道路を走行",
};

type Overrides = Partial<Omit<RecordDetailProps, "record" | "distanceMode">> & {
  record?: FuelRecord;
  distanceMode?: DistanceMode;
};

function Harness({ record = RECORD, distanceMode = "trip", ...detail }: Overrides) {
  const [open, setOpen] = useState(false);
  return (
    <ul>
      <RecordRow record={record} distanceMode={distanceMode} showMonth={false} expanded={open} onToggle={() => setOpen(o => !o)}>
        <RecordDetail
          record={record}
          distanceMode={distanceMode}
          moveTargets={detail.moveTargets ?? [{ id: "v2", name: "セカンドカー" }]}
          readOnly={detail.readOnly ?? false}
          busy={detail.busy ?? false}
          onEdit={detail.onEdit ?? vi.fn()}
          onMove={detail.onMove ?? vi.fn()}
          onDelete={detail.onDelete ?? vi.fn()}
        />
      </RecordRow>
    </ul>
  );
}

function setup(overrides: Overrides = {}) {
  const user = userEvent.setup();
  const result = renderWithProviders(<Harness {...overrides} />);
  const row = screen.getByRole("button", { expanded: false });
  return { user, row, ...result };
}

describe("履歴の行", () => {
  it("日付・店舗名・燃料種別・給油量・距離・燃費・金額を表示し、行に id を付ける", () => {
    const { row, container } = setup();
    expect(container.querySelector("#record-r1")).not.toBeNull();
    expect(within(row).getByText("11")).toBeInTheDocument();
    expect(within(row).getByText("金")).toBeInTheDocument();
    expect(within(row).getByText("コスモ石油 セルフピュア世田谷")).toBeInTheDocument();
    expect(within(row).getByText("ハイオク", { exact: false })).toBeInTheDocument();
    expect(within(row).getByText("15.12")).toBeInTheDocument();
    expect(within(row).getByText("¥4,920")).toBeInTheDocument();
    expect(within(row).getByText("メモあり")).toBeInTheDocument();
  });

  it("部分給油はバッジと「次の満タンで計算」を出す", () => {
    const { row } = setup({ record: { ...RECORD, is_full: false, fuel_efficiency: null, gas_station: null } });
    expect(within(row).getByText("部分給油")).toBeInTheDocument();
    expect(within(row).getByText("次の満タンで計算")).toBeInTheDocument();
    expect(within(row).getByText("店舗名なし")).toBeInTheDocument();
  });

  it("燃費が出ない他の理由は efficiencyNullReason の文言", () => {
    const { row } = setup({ record: { ...RECORD, missed_previous: true, fuel_efficiency: null, total_distance: null } });
    expect(within(row).getByText("記録漏れ")).toBeInTheDocument();
    expect(within(row).getByText("区間不明")).toBeInTheDocument();
  });

  it("押すと開いて明細と操作を出し、もう一度押すと閉じる", async () => {
    const { user, row } = setup();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    await user.click(row);
    expect(row).toHaveAttribute("aria-expanded", "true");
    const region = screen.getByRole("region");
    expect(within(region).getByText("¥169.0")).toBeInTheDocument();
    expect(within(region).getByText("高速道路を走行")).toBeInTheDocument();
    expect(within(region).getByRole("button", { name: "編集" })).toBeEnabled();
    await user.click(row);
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("編集・移動・削除のコールバックを呼ぶ", async () => {
    const onEdit = vi.fn();
    const onMove = vi.fn();
    const onDelete = vi.fn();
    const { user, row } = setup({ onEdit, onMove, onDelete });
    await user.click(row);
    await user.click(screen.getByRole("button", { name: "編集" }));
    expect(onEdit).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /別の車両へ移動/ }));
    await user.click(screen.getByRole("menuitem", { name: "セカンドカー" }));
    expect(onMove).toHaveBeenCalledWith("v2");
    await user.click(screen.getByRole("button", { name: "削除" }));
    expect(onDelete).toHaveBeenCalled();
  });

  it("閲覧専用では操作を押せず、注記を出す", async () => {
    const { user, row } = setup({ readOnly: true });
    await user.click(row);
    expect(screen.getByRole("button", { name: "編集" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "削除" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /別の車両へ移動/ })).toBeDisabled();
    expect(screen.getByText("閲覧専用のため、編集・移動・削除はできません")).toBeInTheDocument();
  });

  it("処理中（確認ダイアログの表示中）は削除・移動のボタンをフォーカスできるまま、押しても何も起きない", async () => {
    const onDelete = vi.fn();
    const onMove = vi.fn();
    const { user, row } = setup({ busy: true, onDelete, onMove });
    await user.click(row);
    // disabled にするとキャンセル後にフォーカスが <body> へ落ちるため、aria-disabled で表す
    const del = screen.getByRole("button", { name: "削除" });
    expect(del).toBeEnabled();
    expect(del).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: /別の車両へ移動/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: "編集" })).toBeDisabled();
    await user.click(del);
    expect(onDelete).not.toHaveBeenCalled();
    del.focus();
    expect(del).toHaveFocus();
    await user.click(screen.getByRole("button", { name: /別の車両へ移動/ }));
    await user.click(screen.getByRole("menuitem", { name: "セカンドカー" }));
    expect(onMove).not.toHaveBeenCalled();
  });

  it("移動先が無ければ「別の車両へ移動」を出さない", async () => {
    const { user, row } = setup({ moveTargets: [] });
    await user.click(row);
    expect(screen.queryByRole("button", { name: /別の車両へ移動/ })).not.toBeInTheDocument();
  });

  it("オドメーターモードでは「区間距離」とオドメーターを明細に出す", async () => {
    const { user, row } = setup({ distanceMode: "odometer" });
    await user.click(row);
    const region = screen.getByRole("region");
    expect(within(region).getByText("区間距離")).toBeInTheDocument();
    expect(within(region).getByText("12,345 km")).toBeInTheDocument();
  });
});
