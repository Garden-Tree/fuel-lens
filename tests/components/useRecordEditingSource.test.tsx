import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useRecordEditing, type RecordEditingScope } from "@/lib/useRecordEditing";
import type { FuelRecord, RecordInput } from "@/lib/types";

const INPUT: RecordInput = {
  date: "2026-09-01",
  total_distance: 100,
  fuel_amount: 10,
  gas_station: null,
  price_per_unit: 170,
  total_cost: 1700,
  fuel_efficiency: 10,
};

function setup() {
  const addRecord = vi.fn(async (r: Omit<FuelRecord, "id" | "vehicle_id">) => ({ ...r, id: "new", vehicle_id: "v1" }) as FuelRecord);
  const updateRecord = vi.fn(async () => {});
  const scope = {
    selectedVehicle: null,
    records: [],
    scopeKey: "v1:trip",
    readOnly: false,
    recordActions: { addRecord, updateRecord },
  } as unknown as RecordEditingScope;
  const form = {
    reset: vi.fn(),
    isValid: true,
    hasCoreValue: true,
    toRecord: () => INPUT,
  };
  const { result } = renderHook(() =>
    useRecordEditing({ scope, form, toast: vi.fn(), confirm: vi.fn(async () => true) })
  );
  return { result, addRecord, updateRecord };
}

describe("useRecordEditing — record source", () => {
  it("manual entry saves with source manual by default", async () => {
    const { result, addRecord } = setup();
    act(() => result.current.startManualEntry());
    await act(() => result.current.save());
    expect(addRecord).toHaveBeenCalledTimes(1);
    expect(addRecord.mock.calls[0][0]).toMatchObject({ ...INPUT, source: "manual" });
  });

  it("manual entry opened from the calc hand-off saves with source calc", async () => {
    const { result, addRecord } = setup();
    act(() => result.current.startManualEntry({ fuel_amount: 10 }, { source: "calc" }));
    await act(() => result.current.save());
    expect(addRecord.mock.calls[0][0]).toMatchObject({ source: "calc" });
  });

  it("the calc flag does not leak into the next manual entry", async () => {
    const { result, addRecord } = setup();
    act(() => result.current.startManualEntry({}, { source: "calc" }));
    act(() => result.current.cancel());
    act(() => result.current.startManualEntry());
    await act(() => result.current.save());
    expect(addRecord.mock.calls[0][0]).toMatchObject({ source: "manual" });
  });

  it("editing never sends a source", async () => {
    const { result, updateRecord } = setup();
    act(() => result.current.startEditing({ ...INPUT, id: "r1", source: "scan" } as FuelRecord));
    await act(() => result.current.save());
    expect(updateRecord).toHaveBeenCalledTimes(1);
    const calls = updateRecord.mock.calls as unknown as [string, Record<string, unknown>][];
    expect(calls[0][1]).not.toHaveProperty("source");
  });
});
