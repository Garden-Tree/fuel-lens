import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";

describe("useBodyScrollLock", () => {
  let scrollTo: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    Object.defineProperty(window, "scrollY", { value: 320, configurable: true });
  });

  afterEach(() => {
    scrollTo.mockRestore();
  });

  it("ロック中は body を固定してスクロール位置を top で保ち、解除で元に戻す", () => {
    document.body.style.overflow = "auto";
    const { unmount } = renderHook(() => useBodyScrollLock(true));
    expect(document.body.style.position).toBe("fixed");
    expect(document.body.style.top).toBe("-320px");
    expect(document.body.style.width).toBe("100%");
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.position).toBe("");
    expect(document.body.style.top).toBe("");
    expect(document.body.style.overflow).toBe("auto");
    expect(scrollTo).toHaveBeenCalledWith(0, 320);
    document.body.style.overflow = "";
  });

  it("active=false では何もしない", () => {
    renderHook(() => useBodyScrollLock(false));
    expect(document.body.style.position).toBe("");
  });

  it("入れ子: 最後のオーバーレイが閉じるまで解除しない", () => {
    const a = renderHook(() => useBodyScrollLock(true));
    const b = renderHook(() => useBodyScrollLock(true));
    a.unmount();
    expect(document.body.style.position).toBe("fixed");
    expect(scrollTo).not.toHaveBeenCalled();
    b.unmount();
    expect(document.body.style.position).toBe("");
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it("スマホのアプリ画面の本文の器（[data-app-scroll]、overflow-y: auto）も止め、位置を保ったまま解除で戻す", () => {
    const scroller = document.createElement("div");
    scroller.setAttribute("data-app-scroll", "");
    scroller.style.overflowY = "auto";
    document.body.appendChild(scroller);
    scroller.scrollTop = 120;

    const a = renderHook(() => useBodyScrollLock(true));
    const b = renderHook(() => useBodyScrollLock(true));
    expect(scroller.style.overflow).toBe("hidden");
    a.unmount();
    expect(scroller.style.overflow).toBe("hidden");
    b.unmount();
    expect(scroller.style.overflow).toBe("");
    expect(scroller.style.overflowY).toBe("auto");
    expect(scroller.scrollTop).toBe(120);
    scroller.remove();
  });

  it("本文の器がスクロールしない設定（PC の overflow: visible）なら触らない", () => {
    const scroller = document.createElement("div");
    scroller.setAttribute("data-app-scroll", "");
    scroller.style.overflow = "visible";
    document.body.appendChild(scroller);
    const { unmount } = renderHook(() => useBodyScrollLock(true));
    expect(scroller.style.overflow).toBe("visible");
    unmount();
    expect(scroller.style.overflow).toBe("visible");
    scroller.remove();
  });
});
