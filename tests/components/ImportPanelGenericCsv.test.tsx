import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ImportPanel from "@/components/ImportPanel";
import type { Vehicle } from "@/lib/types";
import { renderWithProviders } from "../setup/render";

const tripVehicle = { id: "v1", user_id: "u", name: "マイカー", type: "car", distance_mode: "trip" } as Vehicle;

function setup() {
  const addVehicles = vi.fn(async (items: { name: string; type: Vehicle["type"] }[]) =>
    items.map((v, i) => ({ ...v, id: `new${i}`, user_id: "u" }) as Vehicle)
  );
  const addRecords = vi.fn(async (items: unknown[]) => items.length);
  renderWithProviders(
    <ImportPanel
      vehicles={[tripVehicle]}
      loading={false}
      isSignedIn={false}
      readOnly={false}
      vehiclesError={null}
      fetchAllRecords={async () => []}
      addVehicles={addVehicles as never}
      addRecords={addRecords as never}
      busy={null}
      setBusy={() => {}}
    />
  );
  return { addVehicles, addRecords };
}

async function upload(fileName: string) {
  const bytes = readFileSync(join(__dirname, "..", "fixtures", fileName));
  const input = screen.getByLabelText("CSV ファイルを選択");
  await userEvent.upload(input, new File([bytes], fileName, { type: "text/csv" }));
}

describe("ImportPanel 汎用 CSV（列を選んで取り込む）", () => {
  it("Fuelio・FuelLens 以外の CSV は列の割り当てへ進み、推測した列とプレビューを出して取り込める", async () => {
    const { addVehicles, addRecords } = setup();
    await upload("generic-drivvo-like.csv");

    const dateSelect = (await screen.findByLabelText(/^日付/)) as HTMLSelectElement;
    expect(dateSelect.selectedOptions[0].textContent).toBe("Date");
    expect((screen.getByLabelText(/^給油量 L/) as HTMLSelectElement).selectedOptions[0].textContent).toBe("Liters");
    expect(screen.getByRole("radio", { name: "積算距離（オドメーター）" })).toBeChecked();
    expect(screen.getByText(/取り込める行/)).toHaveTextContent("取り込める行 5 件・読み飛ばす行 0 件");
    expect(screen.getByRole("table")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "取り込む" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "取り込む" }));

    await waitFor(() => expect(addRecords).toHaveBeenCalled());
    expect(addVehicles.mock.calls[0][0]).toEqual([
      expect.objectContaining({ name: "インポートした車両", type: "car", distance_mode: "odometer" }),
    ]);
    const records = addRecords.mock.calls[0][0] as { odometer: number | null; total_distance: number | null; source: string }[];
    expect(records).toHaveLength(5);
    expect(records.every(r => r.odometer !== null && r.total_distance === null && r.source === "import")).toBe(true);
  });

  it("トリップ入力方式の既存車両へオドメーターの列で取り込もうとすると止め、意味を合わせると取り込める", async () => {
    setup();
    await upload("generic-drivvo-like.csv");
    const name = await screen.findByLabelText(/取り込み先の車両/);
    await userEvent.clear(name);
    await userEvent.type(name, "マイカー");

    expect(await screen.findByRole("alert")).toHaveTextContent("トリップ入力方式です");
    expect(screen.getByRole("button", { name: "取り込む" })).toBeDisabled();

    await userEvent.click(screen.getByRole("radio", { name: "区間距離（トリップメーター）" }));
    expect(screen.queryByText(/トリップ入力方式です/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取り込む" })).toBeEnabled();
  });

  it("必須の列を「使わない」にすると取り込めない", async () => {
    setup();
    await upload("generic-excel-sjis.csv");
    const dateSelect = (await screen.findByLabelText(/^日付/)) as HTMLSelectElement;
    expect(dateSelect.selectedOptions[0].textContent).toBe("日付");
    expect(screen.getByText(/取り込める行/)).toHaveTextContent("取り込める行 5 件・読み飛ばす行 1 件");
    expect(screen.getByText("7 行目: 日付が読めません")).toBeInTheDocument();

    await userEvent.selectOptions(dateSelect, "使わない");
    expect(screen.getByRole("alert")).toHaveTextContent("日付の列を選んでください。");
    expect(screen.getByRole("button", { name: "取り込む" })).toBeDisabled();
  });
});
