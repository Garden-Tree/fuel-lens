import { describe, expect, it } from "vitest";
import {
  SIGNED_OUT_SCAN_NOTE,
  TRIAL_EXHAUSTED_NOTE,
  TRIAL_MAX_SCANS,
  parseTrialRemaining,
  scanAccessOf,
  trialRemainingNote,
} from "@/lib/trial";

describe("parseTrialRemaining", () => {
  it("accepts integers 0..3 only", () => {
    expect(parseTrialRemaining("0")).toBe(0);
    expect(parseTrialRemaining(" 2 ")).toBe(2);
    expect(parseTrialRemaining("3")).toBe(3);
    for (const bad of [null, undefined, "", "4", "-1", "1.5", "abc", "99"]) {
      expect(parseTrialRemaining(bad)).toBeNull();
    }
  });
});

describe("scanAccessOf", () => {
  it("never locks logged-in users", () => {
    expect(scanAccessOf(false, { enabled: false, remaining: 0 })).toEqual({ locked: false, note: null, warn: false, exhausted: false });
    expect(scanAccessOf(false, { enabled: true, remaining: 0 }).locked).toBe(false);
  });

  it("keeps the old signed-out behaviour when trials are disabled", () => {
    expect(scanAccessOf(true, { enabled: false, remaining: 3 })).toEqual({
      locked: true,
      note: SIGNED_OUT_SCAN_NOTE,
      warn: true,
      exhausted: false,
    });
  });

  it("unlocks scanning while trials remain and shows the remaining count", () => {
    const access = scanAccessOf(true, { enabled: true, remaining: 2 });
    expect(access.locked).toBe(false);
    expect(access.exhausted).toBe(false);
    expect(access.note).toBe(trialRemainingNote(2));
    expect(access.note).toContain("お試しであと 2 回読み取れます");
  });

  it("locks and asks to log in once the trials are used up", () => {
    const access = scanAccessOf(true, { enabled: true, remaining: 0 });
    expect(access).toEqual({ locked: true, note: TRIAL_EXHAUSTED_NOTE, warn: true, exhausted: true });
    expect(TRIAL_EXHAUSTED_NOTE).toContain(`${TRIAL_MAX_SCANS}回まで`);
  });
});
