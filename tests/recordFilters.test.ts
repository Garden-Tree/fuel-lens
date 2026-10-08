import { describe, expect, it } from "vitest";
import {
  isDefaultVehicleSelected,
  isLocalVehicleId,
  isUnclassifiedRecord,
  isUuid,
  matchesSelectedVehicle,
  sortRecordsByDateDesc,
} from "@/lib/recordFilters";

const UUID_A = "0f8fad5b-d9cb-469f-a165-70867728950e";
const UUID_B = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

describe("isUuid", () => {
  it("accepts canonical UUIDs in either case", () => {
    expect(isUuid(UUID_A)).toBe(true);
    expect(isUuid(UUID_A.toUpperCase())).toBe(true);
    expect(isUuid("00000000-0000-0000-0000-000000000000")).toBe(true);
  });

  it("rejects malformed values and non-strings", () => {
    expect(isUuid("0f8fad5b-d9cb-469f-a165-70867728950")).toBe(false); // too short
    expect(isUuid("0f8fad5bd9cb469fa16570867728950e")).toBe(false); // no dashes
    expect(isUuid("zf8fad5b-d9cb-469f-a165-70867728950e")).toBe(false); // non-hex
    expect(isUuid(` ${UUID_A}`)).toBe(false);
    expect(isUuid("default-car")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid(123)).toBe(false);
    expect(isUuid({})).toBe(false);
  });
});

describe("isLocalVehicleId", () => {
  it("recognizes locally generated ids", () => {
    expect(isLocalVehicleId("default-car")).toBe(true);
    expect(isLocalVehicleId("default-anything")).toBe(true);
    expect(isLocalVehicleId("local-vehicle-1700000000000")).toBe(true);
  });

  it("rejects uuids, empty and nullish values", () => {
    expect(isLocalVehicleId(UUID_A)).toBe(false);
    expect(isLocalVehicleId("local-1")).toBe(false);
    expect(isLocalVehicleId("")).toBe(false);
    expect(isLocalVehicleId(null)).toBe(false);
    expect(isLocalVehicleId(undefined)).toBe(false);
  });
});

describe("isUnclassifiedRecord", () => {
  it("treats null / missing / empty / default-* vehicle ids as unclassified", () => {
    expect(isUnclassifiedRecord({})).toBe(true);
    expect(isUnclassifiedRecord({ vehicle_id: null })).toBe(true);
    expect(isUnclassifiedRecord({ vehicle_id: undefined })).toBe(true);
    expect(isUnclassifiedRecord({ vehicle_id: "" })).toBe(true);
    expect(isUnclassifiedRecord({ vehicle_id: "default-car" })).toBe(true);
  });

  it("treats uuid and local-vehicle-* ids as classified", () => {
    expect(isUnclassifiedRecord({ vehicle_id: UUID_A })).toBe(false);
    expect(isUnclassifiedRecord({ vehicle_id: "local-vehicle-1" })).toBe(false);
  });
});

describe("isDefaultVehicleSelected", () => {
  it("is true when nothing is selected or a local default is selected", () => {
    expect(isDefaultVehicleSelected(null, UUID_A)).toBe(true);
    expect(isDefaultVehicleSelected(undefined, UUID_A)).toBe(true);
    expect(isDefaultVehicleSelected("", UUID_A)).toBe(true);
    expect(isDefaultVehicleSelected("default-car", UUID_A)).toBe(true);
    expect(isDefaultVehicleSelected("default-car", null)).toBe(true);
  });

  it("is true only when the selected id equals the default id otherwise", () => {
    expect(isDefaultVehicleSelected(UUID_A, UUID_A)).toBe(true);
    expect(isDefaultVehicleSelected(UUID_A, UUID_B)).toBe(false);
    expect(isDefaultVehicleSelected(UUID_A, null)).toBe(false);
    expect(isDefaultVehicleSelected(UUID_A, undefined)).toBe(false);
    expect(isDefaultVehicleSelected("local-vehicle-1", "default-car")).toBe(false);
  });
});

describe("matchesSelectedVehicle", () => {
  describe("no vehicle selected / local default selected", () => {
    it.each([null, undefined, "", "default-car"])("selected=%j shows only unclassified records", (selected) => {
      expect(matchesSelectedVehicle({ vehicle_id: null }, selected, UUID_A)).toBe(true);
      expect(matchesSelectedVehicle({}, selected, UUID_A)).toBe(true);
      expect(matchesSelectedVehicle({ vehicle_id: "default-car" }, selected, UUID_A)).toBe(true);
      expect(matchesSelectedVehicle({ vehicle_id: UUID_A }, selected, UUID_A)).toBe(false);
      expect(matchesSelectedVehicle({ vehicle_id: "local-vehicle-1" }, selected, UUID_A)).toBe(false);
    });
  });

  describe("default (first) cloud vehicle selected", () => {
    it("includes exact matches and unclassified records", () => {
      expect(matchesSelectedVehicle({ vehicle_id: UUID_A }, UUID_A, UUID_A)).toBe(true);
      expect(matchesSelectedVehicle({ vehicle_id: null }, UUID_A, UUID_A)).toBe(true);
      expect(matchesSelectedVehicle({}, UUID_A, UUID_A)).toBe(true);
      expect(matchesSelectedVehicle({ vehicle_id: "default-car" }, UUID_A, UUID_A)).toBe(true);
    });

    it("excludes records of other vehicles", () => {
      expect(matchesSelectedVehicle({ vehicle_id: UUID_B }, UUID_A, UUID_A)).toBe(false);
      expect(matchesSelectedVehicle({ vehicle_id: "local-vehicle-1" }, UUID_A, UUID_A)).toBe(false);
    });
  });

  describe("non-default cloud vehicle selected", () => {
    it("includes only exact matches (unclassified records are NOT duplicated)", () => {
      expect(matchesSelectedVehicle({ vehicle_id: UUID_B }, UUID_B, UUID_A)).toBe(true);
      expect(matchesSelectedVehicle({ vehicle_id: null }, UUID_B, UUID_A)).toBe(false);
      expect(matchesSelectedVehicle({}, UUID_B, UUID_A)).toBe(false);
      expect(matchesSelectedVehicle({ vehicle_id: "default-car" }, UUID_B, UUID_A)).toBe(false);
      expect(matchesSelectedVehicle({ vehicle_id: UUID_A }, UUID_B, UUID_A)).toBe(false);
    });

    it("does not treat unclassified records as matches when no default id is known", () => {
      expect(matchesSelectedVehicle({ vehicle_id: null }, UUID_A, null)).toBe(false);
      expect(matchesSelectedVehicle({ vehicle_id: null }, UUID_A, undefined)).toBe(false);
      expect(matchesSelectedVehicle({ vehicle_id: UUID_A }, UUID_A, null)).toBe(true);
    });
  });

  describe("local (logged-out) vehicles", () => {
    it("local-vehicle-* selected: only exact matches", () => {
      expect(matchesSelectedVehicle({ vehicle_id: "local-vehicle-1" }, "local-vehicle-1", "default-car")).toBe(true);
      expect(matchesSelectedVehicle({ vehicle_id: "local-vehicle-2" }, "local-vehicle-1", "default-car")).toBe(false);
      expect(matchesSelectedVehicle({ vehicle_id: null }, "local-vehicle-1", "default-car")).toBe(false);
      expect(matchesSelectedVehicle({ vehicle_id: "default-car" }, "local-vehicle-1", "default-car")).toBe(false);
    });

    it("local-vehicle-* selected and also the default: unclassified records are included", () => {
      expect(matchesSelectedVehicle({ vehicle_id: null }, "local-vehicle-1", "local-vehicle-1")).toBe(true);
      expect(matchesSelectedVehicle({ vehicle_id: "default-car" }, "local-vehicle-1", "local-vehicle-1")).toBe(true);
    });
  });
});

describe("sortRecordsByDateDesc", () => {
  const r = (id: string, date: string) => ({ id, date });

  it("sorts by date descending, then id descending", () => {
    const list = [r("a", "2026-01-01"), r("c", "2026-03-01"), r("b", "2026-01-01"), r("d", "2025-12-31")];
    expect(sortRecordsByDateDesc(list).map(x => x.id)).toEqual(["c", "b", "a", "d"]);
  });

  it("puts empty / unparseable dates last (id descending among them) instead of returning NaN", () => {
    const list = [r("x1", "not-a-date"), r("a", "2026-01-01"), r("x2", ""), r("x3", "2026-02-30"), r("b", "2026-02-01")];
    expect(sortRecordsByDateDesc(list).map(x => x.id)).toEqual(["b", "a", "x3", "x2", "x1"]);
  });

  it("does not mutate the input", () => {
    const list = [r("a", "2026-01-01"), r("b", "2026-02-01")];
    sortRecordsByDateDesc(list);
    expect(list.map(x => x.id)).toEqual(["a", "b"]);
  });
});
