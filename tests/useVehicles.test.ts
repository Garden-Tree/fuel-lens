import { describe, expect, it } from "vitest";
import { pickSelected, selectedVehicleStorageKey, shouldPersistSelection } from "@/lib/useVehicles";
import type { Vehicle } from "@/lib/useVehicles";

const v = (id: string): Vehicle => ({ id, user_id: "u", name: id, type: "car" });

describe("selectedVehicleStorageKey", () => {
  it("uses the legacy key when logged out", () => {
    expect(selectedVehicleStorageKey(null)).toBe("fuel_lens_selected_vehicle_id");
    expect(selectedVehicleStorageKey(undefined)).toBe("fuel_lens_selected_vehicle_id");
  });

  it("is scoped per user when signed in", () => {
    expect(selectedVehicleStorageKey("user_a")).toBe("fuel_lens_selected_vehicle_id_user_a");
    expect(selectedVehicleStorageKey("user_a")).not.toBe(selectedVehicleStorageKey("user_b"));
  });
});

describe("pickSelected / shouldPersistSelection", () => {
  it("falls back to the first vehicle when the stored id is stale, and asks to persist it", () => {
    const list = [v("b1"), v("b2")];
    const effective = pickSelected(list, "a-vehicle");
    expect(effective).toBe("b1");
    expect(shouldPersistSelection(effective, "a-vehicle")).toBe(true);
  });

  it("keeps a valid stored id and does not rewrite it", () => {
    const effective = pickSelected([v("b1"), v("b2")], "b2");
    expect(effective).toBe("b2");
    expect(shouldPersistSelection(effective, "b2")).toBe(false);
  });

  it("persists when nothing is stored", () => {
    expect(shouldPersistSelection(pickSelected([v("b1")], null), null)).toBe(true);
  });
});
