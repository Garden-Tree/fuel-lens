import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ImportPanel from "@/components/ImportPanel";
import { buildRecordsCsv } from "@/lib/csv";
import type { FuelRecord, Vehicle } from "@/lib/types";
import { renderWithProviders } from "../setup/render";

const vehicle = { id: "v1", user_id: "u", name: "マイカー", type: "car" } as Vehicle;
const rec = (id: string, date: string): FuelRecord => ({
  id,
  date,
  total_distance: 400,
  fuel_amount: 30,
  gas_station: null,
  price_per_unit: 170,
  total_cost: 5100,
  fuel_efficiency: 13.3,
  vehicle_id: "v1",
  created_at: null,
});

function setup(addRecords: () => Promise<unknown>) {
  const csv = buildRecordsCsv([rec("r1", "2024-01-10"), rec("r2", "2024-02-10")], new Map([["v1", vehicle]]));
  renderWithProviders(
    <ImportPanel
      vehicles={[vehicle]}
      loading={false}
      isSignedIn={false}
      readOnly={false}
      vehiclesError={null}
      fetchAllRecords={async () => []}
      addVehicles={vi.fn(async () => [])}
      addRecords={addRecords as never}
      busy={null}
      setBusy={() => {}}
    />
  );
  return csv;
}

async function pickAndImport(csv: string) {
  const input = screen.getByLabelText("CSV ファイルを選択");
  await userEvent.upload(input, new File([csv], "fuellens_all_2024-03-01.csv", { type: "text/csv" }));
  await userEvent.click(await screen.findByRole("button", { name: "取り込む" }));
  const dialog = await screen.findByRole("dialog");
  await userEvent.click(within(dialog).getByRole("button", { name: "取り込む" }));
}

describe("ImportPanel 取り込み後の案内", () => {
  it("成功して記録が追加されたら次の給油の案内カードを出し、閉じられる", async () => {
    const csv = setup(vi.fn(async () => 2));
    await pickAndImport(csv);
    expect(await screen.findByRole("heading", { name: "取り込みが終わりました" })).toBeInTheDocument();
    // トースト側にも「閉じる」があるので、カードの中のボタンを押す
    const card = screen.getByRole("heading", { name: "取り込みが終わりました" }).closest("section")!;
    await userEvent.click(within(card).getByRole("button", { name: "閉じる" }));
    expect(screen.queryByRole("heading", { name: "取り込みが終わりました" })).not.toBeInTheDocument();
  });

  it("失敗したときは案内カードを出さない", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const csv = setup(
      vi.fn(async () => {
        throw new Error("boom");
      })
    );
    await pickAndImport(csv);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: "取り込みが終わりました" })).not.toBeInTheDocument();
  });
});
