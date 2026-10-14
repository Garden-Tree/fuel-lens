import { describe, expect, it } from "vitest";
import { clientUatIndicatesSignedIn, createCachePreview, resolveAuth, type CachePreviewIO } from "@/lib/data/initialAuth";
import { combinePreviewing } from "@/lib/useVehicleScope";

const notLoaded = { isLoaded: false, isSignedIn: false, userId: null };

describe("resolveAuth（Clerk の読み込み前はサーバーの初期認証状態で補う）", () => {
  it("サーバーが未ログインなら Clerk を待たずにローカルで読み込める", () => {
    expect(resolveAuth(notLoaded, { signedIn: false, userId: null }, false)).toEqual({
      isLoaded: true,
      isSignedIn: false,
      userId: null,
      previewUserId: null,
    });
  });

  it("サーバーが未ログインでも、クライアント Cookie がログイン中かもしれない・読めないなら信用せず Clerk を待つ", () => {
    // RSC の遷移ではトークンの期限切れで handshake が起きず、サーバーが未ログインと判定することがある
    for (const client of [true, null]) {
      expect(resolveAuth(notLoaded, { signedIn: false, userId: null }, client)).toEqual({
        isLoaded: false,
        isSignedIn: false,
        userId: null,
        previewUserId: null,
      });
    }
  });

  it("サーバーがログイン中なら Clerk を待つ（ログイン中とはまだ判定しない）が、キャッシュの先行表示の対象にする", () => {
    expect(resolveAuth(notLoaded, { signedIn: true, userId: "u1" }, true)).toEqual({
      isLoaded: false,
      isSignedIn: false,
      userId: null,
      previewUserId: "u1",
    });
  });

  it("不明（null）なら従来どおり Clerk を待ち、キャッシュも出さない", () => {
    expect(resolveAuth(notLoaded, null, false)).toEqual({ isLoaded: false, isSignedIn: false, userId: null, previewUserId: null });
  });

  it("Clerk の読み込み後は Clerk の値だけを使う（サーバーの値が古くても）", () => {
    expect(resolveAuth({ isLoaded: true, isSignedIn: true, userId: "u1" }, { signedIn: false, userId: null }, false)).toEqual({
      isLoaded: true,
      isSignedIn: true,
      userId: "u1",
      previewUserId: null,
    });
    expect(resolveAuth({ isLoaded: true, isSignedIn: false, userId: null }, { signedIn: true, userId: "u1" }, true)).toEqual({
      isLoaded: true,
      isSignedIn: false,
      userId: null,
      previewUserId: null,
    });
  });
});

describe("clientUatIndicatesSignedIn（Clerk のクライアント Cookie）", () => {
  it("無い・0 なら未ログイン", () => {
    expect(clientUatIndicatesSignedIn("")).toBe(false);
    expect(clientUatIndicatesSignedIn("theme=dark; __client_uat=0")).toBe(false);
    expect(clientUatIndicatesSignedIn("__client_uat=0; __client_uat_AbC123=0")).toBe(false);
    expect(clientUatIndicatesSignedIn("x__client_uat=1700000000")).toBe(false);
  });

  it("0 より大きい（サフィックス付きも）・読めない値ならログイン中かもしれない", () => {
    expect(clientUatIndicatesSignedIn("__client_uat=1700000000")).toBe(true);
    expect(clientUatIndicatesSignedIn("a=1; __client_uat=0; __client_uat_AbC123=1700000000")).toBe(true);
    expect(clientUatIndicatesSignedIn("__client_uat=abc")).toBe(true);
  });
});

describe("createCachePreview（キャッシュの持ち主が一致するときだけ読む）", () => {
  const store: Record<string, unknown> = {
    fuel_lens_cache_vehicles_u1: [{ id: "v1" }],
    fuel_lens_cache_records_u1_v1: [{ id: "r1" }],
    fuel_lens_cache_vehicles_u2: [{ id: "x" }],
  };
  const io = (owner: string | null): CachePreviewIO => ({ owner: () => owner, read: key => store[key] ?? null });
  const scope = { vehicleId: "v1", includeUnclassified: true };

  it("持ち主が同じユーザーなら最後に同期した一覧を返す", () => {
    const preview = createCachePreview("u1", io("u1"));
    expect(preview.vehicles()).toEqual([{ id: "v1" }]);
    expect(preview.records(scope)).toEqual([{ id: "r1" }]);
    expect(preview.records({ vehicleId: "v2", includeUnclassified: false })).toBeNull();
  });

  it("持ち主が違う・記録されていないなら何も返さない", () => {
    for (const owner of ["u2", null]) {
      const preview = createCachePreview("u1", io(owner));
      expect(preview.vehicles()).toBeNull();
      expect(preview.records(scope)).toBeNull();
    }
  });

  it("配列でない値は無視する", () => {
    const preview = createCachePreview("u1", { owner: () => "u1", read: () => ({ broken: true }) });
    expect(preview.vehicles()).toBeNull();
  });
});

describe("combinePreviewing", () => {
  it("一覧を読まない画面では記録の先行表示を見ない", () => {
    expect(combinePreviewing(false, true, true)).toBe(true);
    expect(combinePreviewing(false, true, false)).toBe(false);
    expect(combinePreviewing(true, false, false)).toBe(true);
  });
});
