import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { useShortcutActions, type UseShortcutActionsOptions } from "@/lib/scan/useShortcutActions";

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

const READY = { scan: true, manual: true, shared: true, notice: true };

function Harness(props: UseShortcutActionsOptions) {
  useShortcutActions(props);
  return null;
}

function callbacks() {
  return { onScan: vi.fn(), onAlbum: vi.fn(), onManual: vi.fn(), onShared: vi.fn(), onShareUnavailable: vi.fn() };
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

  it("準備ができるまで待ち、整ったら実行する", () => {
    const cb = callbacks();
    nav.params = new URLSearchParams("action=album");
    const { rerender } = render(<Harness readiness={{ ...READY, scan: false }} {...cb} />);
    expect(cb.onAlbum).not.toHaveBeenCalled();
    expect(nav.replace).not.toHaveBeenCalled();
    rerender(<Harness readiness={READY} {...cb} />);
    expect(cb.onAlbum).toHaveBeenCalledTimes(1);
  });
});
