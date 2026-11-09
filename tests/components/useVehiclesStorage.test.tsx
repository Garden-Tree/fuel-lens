import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Vehicle } from "@/lib/types";

const storesMock = vi.hoisted(() => ({ useDataStores: vi.fn() }));
vi.mock("@/lib/data/useDataStores", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/data/useDataStores")>()),
  useDataStores: storesMock.useDataStores,
}));

import { useVehicles } from "@/lib/useVehicles";

const VEHICLE: Vehicle = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "メインカー",
  type: "car",
} as Vehicle;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  // ストレージがブロックされている（getItem が SecurityError を投げる）
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new DOMException("blocked", "SecurityError");
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  storesMock.useDataStores.mockReset();
});

describe("useVehicles — localStorage が使えない", () => {
  it("ログイン中でも選択の読み込みで止まらず、一覧を読み込んで loading を解除する", async () => {
    storesMock.useDataStores.mockReturnValue({
      isLoaded: true,
      authLoaded: true,
      isSignedIn: true,
      userId: "user-1",
      cachePreview: null,
      stores: {
        kind: "cloud",
        bootstrap: async () => ({ migrationError: null }),
        vehicles: { list: async () => [VEHICLE], cached: () => null },
      },
    });
    const { result } = renderHook(() => useVehicles());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.vehicles.map((v) => v.id)).toEqual([VEHICLE.id]);
    expect(result.current.selectedVehicleId).toBe(VEHICLE.id);
  });

  it("読み込みが想定外の例外で終わっても loading を立てたままにしない", async () => {
    storesMock.useDataStores.mockReturnValue({
      isLoaded: true,
      authLoaded: true,
      isSignedIn: false,
      userId: null,
      cachePreview: null,
      stores: {
        kind: "local",
        vehicles: {
          list: async () => {
            throw new Error("unexpected");
          },
          cached: () => null,
        },
      },
    });
    const { result } = renderHook(() => useVehicles());
    await waitFor(() => expect(result.current.loading).toBe(false));
  });
});
