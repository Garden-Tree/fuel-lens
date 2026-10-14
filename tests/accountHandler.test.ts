import { describe, expect, it, vi } from "vitest";
import {
  ACCOUNT_DELETE_FAILED_MESSAGE,
  USER_MISMATCH_MESSAGE,
  handleDeleteAccount,
  type AccountDeleteDeps,
} from "@/lib/server/account/handler";
import { createRateLimiter } from "@/lib/server/analyze/rateLimit";

const NOW = 1_000_000;

function makeDeps(overrides: Partial<AccountDeleteDeps> = {}) {
  const deleteUser = vi.fn(async () => ({}));
  const log = vi.fn();
  const deps: AccountDeleteDeps = {
    auth: async () => ({ userId: "user_1" }),
    deleteUser,
    limiter: createRateLimiter({ windowMs: 60_000, max: 3, maxKeys: 10_000, now: () => NOW }),
    env: {},
    log,
    newRequestId: () => "req00001",
    ...overrides,
  };
  return { deps, deleteUser, log };
}

function request(headers: Record<string, string> = {}, body?: unknown) {
  return new Request("https://fuel-lens.example/api/account", {
    method: "DELETE",
    headers: { host: "fuel-lens.example", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe("handleDeleteAccount", () => {
  it("ログイン中なら Clerk のユーザーを削除して 204 を返す", async () => {
    const { deps, deleteUser } = makeDeps();
    const res = await handleDeleteAccount(request({ origin: "https://fuel-lens.example" }), deps);
    expect(res.status).toBe(204);
    expect(deleteUser).toHaveBeenCalledWith("user_1");
  });

  it("expectedUserId が一致すれば 204", async () => {
    const { deps, deleteUser } = makeDeps();
    const res = await handleDeleteAccount(request({}, { expectedUserId: "user_1" }), deps);
    expect(res.status).toBe(204);
    expect(deleteUser).toHaveBeenCalledWith("user_1");
  });

  it("expectedUserId が auth() のユーザーと違えば 409 で、何も削除しない", async () => {
    const { deps, deleteUser } = makeDeps();
    const res = await handleDeleteAccount(request({}, { expectedUserId: "user_other" }), deps);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: USER_MISMATCH_MESSAGE, code: "USER_MISMATCH", requestId: "req00001" });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("未ログインは 401 で、削除しない", async () => {
    const { deps, deleteUser } = makeDeps({ auth: async () => ({ userId: null }) });
    const res = await handleDeleteAccount(request(), deps);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "UNAUTHENTICATED", requestId: "req00001" });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("別オリジンからは 403", async () => {
    const { deps, deleteUser } = makeDeps();
    const res = await handleDeleteAccount(request({ origin: "https://evil.example" }), deps);
    expect(res.status).toBe(403);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("上限を超えたら 429 と Retry-After", async () => {
    const { deps } = makeDeps();
    for (let i = 0; i < 3; i++) expect((await handleDeleteAccount(request(), deps)).status).toBe(204);
    const res = await handleDeleteAccount(request(), deps);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
  });

  it("Clerk が 404（削除済み）なら 204", async () => {
    const { deps } = makeDeps({ deleteUser: vi.fn(async () => Promise.reject({ status: 404 })) });
    expect((await handleDeleteAccount(request(), deps)).status).toBe(204);
  });

  it("Clerk の失敗は 500 と requestId 付きの汎用メッセージにし、本文を返さない", async () => {
    const { deps, log } = makeDeps({
      deleteUser: vi.fn(async () => Promise.reject(Object.assign(new Error("Clerk internal detail"), { status: 500 }))),
    });
    const res = await handleDeleteAccount(request(), deps);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: ACCOUNT_DELETE_FAILED_MESSAGE, code: "DELETE_FAILED", requestId: "req00001" });
    expect(JSON.stringify(body)).not.toContain("Clerk internal detail");
    expect(log).toHaveBeenCalledWith("error", "[account req00001]", "Account deletion failed:", expect.any(Error));
  });
});
