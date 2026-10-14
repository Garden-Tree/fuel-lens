import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { useReturnRefresh, type UseReturnRefreshOptions } from "@/lib/useReturnRefresh";

function Harness({ onRefresh, ...options }: { onRefresh: () => void } & UseReturnRefreshOptions) {
  useReturnRefresh(onRefresh, options);
  return null;
}

let visibility: DocumentVisibilityState = "visible";
let online = true;

function setVisibility(state: DocumentVisibilityState) {
  visibility = state;
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

/** ms だけ画面から離れて戻る */
function leaveFor(ms: number) {
  setVisibility("hidden");
  act(() => {
    vi.advanceTimersByTime(ms);
  });
  setVisibility("visible");
}

describe("useReturnRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-14T09:00:00+09:00"));
    visibility = "visible";
    online = true;
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => online });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("10 秒以上離れて戻ったら 1 回だけ呼ぶ（続く focus では呼ばない）", () => {
    const onRefresh = vi.fn();
    render(<Harness onRefresh={onRefresh} />);
    leaveFor(15_000);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("短いタブ切り替え（10 秒未満）では呼ばない", () => {
    const onRefresh = vi.fn();
    render(<Harness onRefresh={onRefresh} />);
    leaveFor(5_000);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("前回から 30 秒以内は呼ばない（間隔の制限）", () => {
    const onRefresh = vi.fn();
    render(<Harness onRefresh={onRefresh} />);
    leaveFor(15_000); // 再取得（t=15s）
    leaveFor(12_000); // 前回から 12 秒: しない
    expect(onRefresh).toHaveBeenCalledTimes(1);
    leaveFor(20_000); // 前回から 32 秒: する
    expect(onRefresh).toHaveBeenCalledTimes(2);
  });

  it("オフラインでは呼ばない", () => {
    const onRefresh = vi.fn();
    render(<Harness onRefresh={onRefresh} />);
    online = false;
    leaveFor(60_000);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("enabled: false の間は呼ばない", () => {
    const onRefresh = vi.fn();
    render(<Harness onRefresh={onRefresh} enabled={false} />);
    leaveFor(60_000);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("blur → focus（visibilitychange が来ない環境）でも呼ぶ", () => {
    const onRefresh = vi.fn();
    render(<Harness onRefresh={onRefresh} />);
    act(() => {
      window.dispatchEvent(new Event("blur"));
      vi.advanceTimersByTime(15_000);
      window.dispatchEvent(new Event("focus"));
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("同じ画面の複数の購読者は、戻るたびにそれぞれ 1 回ずつ呼ばれる", () => {
    const a = vi.fn();
    const b = vi.fn();
    render(
      <>
        <Harness onRefresh={a} />
        <Harness onRefresh={b} />
      </>
    );
    leaveFor(15_000);
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("アンマウント後は呼ばない", () => {
    const onRefresh = vi.fn();
    const { unmount } = render(<Harness onRefresh={onRefresh} />);
    unmount();
    leaveFor(60_000);
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
