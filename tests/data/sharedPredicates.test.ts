import { describe, expect, it } from "vitest";
import { parseArray } from "@/lib/data/localStore";
import { matchesVehicleScope } from "@/lib/recordFilters";

describe("parseArray", () => {
  it("JSON の配列を返す", () => {
    expect(parseArray('[1,{"id":"a"}]')).toEqual([1, { id: "a" }]);
  });

  it("無い・壊れている・配列でなければ空配列", () => {
    expect(parseArray(null)).toEqual([]);
    expect(parseArray("")).toEqual([]);
    expect(parseArray("{bad")).toEqual([]);
    expect(parseArray('{"id":"a"}')).toEqual([]);
    expect(parseArray("null")).toEqual([]);
  });
});

describe("matchesVehicleScope", () => {
  it("選択中の車両の記録は含め、未分類は includeUnclassified のときだけ", () => {
    const scope = { vehicleId: "v1", includeUnclassified: false };
    expect(matchesVehicleScope({ vehicle_id: "v1" }, scope)).toBe(true);
    expect(matchesVehicleScope({ vehicle_id: "v2" }, scope)).toBe(false);
    expect(matchesVehicleScope({ vehicle_id: null }, scope)).toBe(false);
    expect(matchesVehicleScope({ vehicle_id: null }, { ...scope, includeUnclassified: true })).toBe(true);
  });

  it("ローカル既定車両（default-*）を選択中なら未分類の記録だけ", () => {
    const scope = { vehicleId: "default-car", includeUnclassified: true };
    expect(matchesVehicleScope({ vehicle_id: "default-car" }, scope)).toBe(true);
    expect(matchesVehicleScope({ vehicle_id: "default-car" }, { ...scope, includeUnclassified: false })).toBe(false);
    expect(matchesVehicleScope({ vehicle_id: "v1" }, scope)).toBe(false);
  });
});
