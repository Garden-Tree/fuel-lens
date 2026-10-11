import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { useShortcutActions, type UseShortcutActionsOptions } from "@/lib/scan/useShortcutActions";
import type { ShortcutReadiness } from "@/lib/scan/shortcuts";

// 検索パラメータを書き換えられる next/navigation のモック（tests/setup/dom.ts のモックを上書きする）
const nav = vi.hoisted(() => ({
  params: new URLSearchParams(),
  replace: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => nav.params,
  usePathname: () => "/app",
}));

const READY: ShortcutReadiness = { evaluable: true, scanBlock: null, manualBlock: null, shared: true, notice: true };
const LOADING: ShortcutReadiness = { evaluable: false, scanBlock: "loading", manualBlock: "loading", shared: false, notice: true };

function Harness(props: UseShortcutActionsOptions) {
  useShortcutActions(props);
  return null;
}

function callbacks() {
  return {
    onScan: vi.fn(),
    onAlbum: vi.fn(),
    onManual: vi.fn(),
    onShared: vi.fn(),
    onShareUnavailable: vi.fn(),
    onBlocked: vi.fn(),
  };
}

describe("useShortcutActions", () => {
  beforeEach(() => {
    nav.params = new URLSearchParams();
    nav.replace.mockReset();
  });

  it("album はアルバムを開き、URL から action を消す", () => {
    const cb = callbacks();
    nav.params = new URLSearchParams("action=album");
    render(<Harness readiness={READY} {...cb} />);
    expect(cb.onAlbum).toHaveBeenCalledTimes(1);
    expect(cb.onScan).not.toHaveBeenCalled();
    expect(nav.replace).toHaveBeenCalledWith("/app");
  });

  it("同じ action のまま再レンダーしても 1 回だけ実行する", () => {
    const cb = callbacks();
    nav.params = new URLSearchParams("action=scan");
    const { rerender } = render(<Harness readiness={READY} {...cb} />);
    rerender(<Harness readiness={READY} {...cb} />);
    expect(cb.onScan).toHaveBeenCalledTimes(1);
  });

  it("画面を開いたまま action が消えて再び付いたら、もう一度実行する（スキャンメニュー）", () => {
    const cb = callbacks();
    nav.params = new URLSearchParams("action=scan");
    const { rerender } = render(<Harness readiness={READY} {...cb} />);
    expect(cb.onScan).toHaveBeenCalledTimes(1);

    nav.params = new URLSearchParams();
    rerender(<Harness readiness={READY} {...cb} />);
    nav.params = new URLSearchParams("action=scan");
    rerender(<Harness readiness={READY} {...cb} />);
    expect(cb.onScan).toHaveBeenCalledTimes(2);

    nav.params = new URLSearchParams();
    rerender(<Harness readiness={READY} {...cb} />);
    nav.params = new URLSearchParams("action=manual");
    rerender(<Harness readiness={READY} {...cb} />);
    expect(cb.onManual).toHaveBeenCalledTimes(1);
  });

  it("読み込みが終わるまで待ち、整ったら実行する", () => {
    const cb = callbacks();
    nav.params = new URLSearchParams("action=album");
    const { rerender } = render(<Harness readiness={LOADING} {...cb} />);
    expect(cb.onAlbum).not.toHaveBeenCalled();
    expect(nav.replace).not.toHaveBeenCalled();
    rerender(<Harness readiness={READY} {...cb} />);
    expect(cb.onAlbum).toHaveBeenCalledTimes(1);
  });

  it("解析中に撮影が来たら実行せずに取り下げ、理由を伝える（解析が終わっても後から開かない）", () => {
    const cb = callbacks();
    nav.params = new URLSearchParams("action=scan");
    const scanning: ShortcutReadiness = { ...READY, scanBlock: "scanning", manualBlock: "scanning", shared: false };
    const { rerender } = render(<Harness readiness={scanning} {...cb} />);
    expect(cb.onBlocked).toHaveBeenCalledWith("読み取り中のため撮影を開始できません");
    expect(nav.replace).toHaveBeenCalledWith("/app");
    // URL が消える前に解析が終わっても実行しない
    rerender(<Harness readiness={READY} {...cb} />);
    nav.params = new URLSearchParams();
    rerender(<Harness readiness={READY} {...cb} />);
    expect(cb.onScan).not.toHaveBeenCalled();
    expect(cb.onBlocked).toHaveBeenCalledTimes(1);
  });

  it("閲覧専用で手動入力が来たら取り下げる", () => {
    const cb = callbacks();
    nav.params = new URLSearchParams("action=manual");
    const { rerender } = render(<Harness readiness={{ ...READY, manualBlock: "readOnly" }} {...cb} />);
    expect(cb.onBlocked).toHaveBeenCalledWith("閲覧専用のため手動入力はできません");
    rerender(<Harness readiness={READY} {...cb} />);
    expect(cb.onManual).not.toHaveBeenCalled();
  });

  it("共有画像は解析中なら取り下げずに待ち、終わったら取り出す", () => {
    const cb = callbacks();
    nav.params = new URLSearchParams("action=shared&t=tok");
    const scanning: ShortcutReadiness = { ...READY, scanBlock: "scanning", manualBlock: "scanning", shared: false };
    const { rerender } = render(<Harness readiness={scanning} {...cb} />);
    expect(cb.onShared).not.toHaveBeenCalled();
    expect(cb.onBlocked).not.toHaveBeenCalled();
    expect(nav.replace).not.toHaveBeenCalled();
    rerender(<Harness readiness={READY} {...cb} />);
    expect(cb.onShared).toHaveBeenCalledWith("tok");
  });
});
