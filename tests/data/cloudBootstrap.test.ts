import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bootstrapCloud, type CloudBootstrapDeps } from "@/lib/data/cloudBootstrap";
import { CrossTabLockError } from "@/lib/crossTabLock";
import { SupabaseAuthTokenError } from "@/lib/supabaseClient";

const supabase = {} as SupabaseClient;
let seq = 0;
const nextUser = () => `user-boot-${++seq}`;

function makeDeps(impl: Partial<Omit<CloudBootstrapDeps, "now">> = {}) {
  let now = 1_000_000;
  const deps = {
    migrate: vi.fn<CloudBootstrapDeps["migrate"]>(impl.migrate ?? (async () => undefined)),
    ensureDefaultVehicle: vi.fn<CloudBootstrapDeps["ensureDefaultVehicle"]>(impl.ensureDefaultVehicle ?? (async () => [])),
    hasLocalData: vi.fn<CloudBootstrapDeps["hasLocalData"]>(impl.hasLocalData ?? (() => false)),
    now: () => now,
  } satisfies CloudBootstrapDeps;
  return { deps, advance: (ms: number) => void (now += ms) };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("bootstrapCloud", () => {
  it("runs migrate then ensureDefaultVehicle once per user and shares the in-flight promise", async () => {
    const order: string[] = [];
    const { deps } = makeDeps({
      migrate: vi.fn(async () => void order.push("migrate")),
      ensureDefaultVehicle: vi.fn(async () => {
        order.push("ensure");
        return [];
      }),
    });
    const user = nextUser();
    const p1 = bootstrapCloud(supabase, user, deps);
    const p2 = bootstrapCloud(supabase, user, deps);
    expect(p2).toBe(p1);
    await expect(p1).resolves.toEqual({ migrationError: null });
    await bootstrapCloud(supabase, user, deps);
    expect(order).toEqual(["migrate", "ensure"]);

    // 別のユーザーは別に実行する
    await bootstrapCloud(supabase, nextUser(), deps);
    expect(deps.migrate).toHaveBeenCalledTimes(2);
  });

  it("re-runs when local data to migrate appears (e.g. recorded while signed out)", async () => {
    const { deps } = makeDeps();
    const user = nextUser();
    await bootstrapCloud(supabase, user, deps);
    deps.hasLocalData.mockReturnValue(true);
    await bootstrapCloud(supabase, user, deps);
    expect(deps.migrate).toHaveBeenCalledTimes(2);
    expect(deps.hasLocalData).toHaveBeenCalledWith(user);
  });

  it("surfaces a non-outage migration failure as a Japanese migrationError and still ensures the default vehicle", async () => {
    const { deps, advance } = makeDeps({
      migrate: vi.fn(async () => {
        throw Object.assign({ message: "rls", code: "42501" }, { status: 403 });
      }),
      hasLocalData: vi.fn(() => true),
    });
    const user = nextUser();
    const result = await bootstrapCloud(supabase, user, deps);
    expect(result.migrationError).toBe(
      "ローカルの記録をクラウドへ移行できませんでした（データはブラウザに保持されています）。アクセス権限がありません。ログインし直してください。"
    );
    expect(deps.ensureDefaultVehicle).toHaveBeenCalledTimes(1);

    // 直後（30 秒以内）は同じ結果を返し、退避⇄復元を繰り返さない
    await expect(bootstrapCloud(supabase, user, deps)).resolves.toBe(result);
    expect(deps.migrate).toHaveBeenCalledTimes(1);
    advance(31_000);
    await bootstrapCloud(supabase, user, deps);
    expect(deps.migrate).toHaveBeenCalledTimes(2);
  });

  it("keeps the CrossTabLockError message in migrationError", async () => {
    const { deps } = makeDeps({
      migrate: vi.fn(async () => {
        throw new CrossTabLockError("他のタブの処理が完了しないため移行を中断しました。再読み込みしてください。");
      }),
    });
    const { migrationError } = await bootstrapCloud(supabase, nextUser(), deps);
    expect(migrationError).toContain("他のタブの処理が完了しないため移行を中断しました。");
  });

  it("does not report a missing auth token as a migration error (the next step fails with the re-login message)", async () => {
    const { deps } = makeDeps({
      migrate: vi.fn(async () => {
        throw new SupabaseAuthTokenError();
      }),
    });
    await expect(bootstrapCloud(supabase, nextUser(), deps)).resolves.toEqual({ migrationError: null });
  });

  it("rethrows an outage during migration without ensuring the default vehicle, and retries next time", async () => {
    const paused = Object.assign({ message: "paused" }, { status: 540 });
    const { deps } = makeDeps({
      migrate: vi.fn(async () => {
        throw paused;
      }),
    });
    const user = nextUser();
    await expect(bootstrapCloud(supabase, user, deps)).rejects.toBe(paused);
    expect(deps.ensureDefaultVehicle).not.toHaveBeenCalled();

    deps.migrate.mockResolvedValue(undefined);
    await expect(bootstrapCloud(supabase, user, deps)).resolves.toEqual({ migrationError: null });
    expect(deps.migrate).toHaveBeenCalledTimes(2);
  });

  it("rethrows ensureDefaultVehicle failures and retries next time", async () => {
    const { deps } = makeDeps({
      ensureDefaultVehicle: vi.fn(async () => {
        throw Object.assign({ message: "bad" }, { status: 400 });
      }),
    });
    const user = nextUser();
    await expect(bootstrapCloud(supabase, user, deps)).rejects.toMatchObject({ status: 400 });
    deps.ensureDefaultVehicle.mockResolvedValue([]);
    await expect(bootstrapCloud(supabase, user, deps)).resolves.toEqual({ migrationError: null });
    expect(deps.ensureDefaultVehicle).toHaveBeenCalledTimes(2);
  });
});
