import { describe, expect, it, vi } from "vitest";
import { withPrimedVehicleList } from "@/lib/data/primedVehicles";
import type { VehicleStore } from "@/lib/data/types";
import type { Vehicle } from "@/lib/types";

const veh = (id: string): Vehicle => ({ id, user_id: "u", name: id, type: "car" });

function fakeStore(list: Vehicle[] = [veh("fresh")]): VehicleStore {
  return {
    list: vi.fn<VehicleStore["list"]>(async () => list),
    add: vi.fn<VehicleStore["add"]>(async input => ({ ...veh("new"), ...input })),
    addMany: vi.fn<VehicleStore["addMany"]>(async () => []),
    update: vi.fn<VehicleStore["update"]>(async () => {}),
    remove: vi.fn<VehicleStore["remove"]>(async () => {}),
  };
}

describe("withPrimedVehicleList", () => {
  it("returns the primed list once (normalized), then delegates", async () => {
    const base = fakeStore();
    const { store, prime } = withPrimedVehicleList(base);
    prime([veh("primed")]);
    const first = await store.list();
    expect(first.map(v => v.id)).toEqual(["primed"]);
    // 新しい列は既定値で補完される
    expect(first[0].distance_mode).toBeDefined();
    expect(base.list).not.toHaveBeenCalled();

    expect((await store.list()).map(v => v.id)).toEqual(["fresh"]);
    expect(base.list).toHaveBeenCalledTimes(1);
  });

  it("prime(null) clears a primed list", async () => {
    const base = fakeStore();
    const { store, prime } = withPrimedVehicleList(base);
    prime([veh("primed")]);
    prime(null);
    expect((await store.list()).map(v => v.id)).toEqual(["fresh"]);
    expect(base.list).toHaveBeenCalledTimes(1);
  });

  it("delegates list() when nothing is primed, and passes other methods through unchanged", async () => {
    const base = fakeStore();
    const { store } = withPrimedVehicleList(base);
    expect((await store.list()).map(v => v.id)).toEqual(["fresh"]);
    await store.remove("x");
    expect(base.remove).toHaveBeenCalledWith("x");
  });
});
