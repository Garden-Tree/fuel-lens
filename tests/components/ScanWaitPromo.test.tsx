import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import ScanWaitPromoModal from "@/components/ScanWaitPromoModal";
import { SCAN_WAIT_PROMOS, SCAN_WAIT_PROMO_DELAY_MS, SCAN_WAIT_PROMO_STORAGE_KEY } from "@/lib/promo/scanWait";
import { useScanWaitPromo } from "@/lib/promo/useScanWaitPromo";
import type { ScanLoadingStep } from "@/lib/scan/useScanPipeline";
import type { VehicleType } from "@/lib/types";

function Harness({ step, type = "bike", onCancel }: { step: ScanLoadingStep; type?: VehicleType; onCancel?: () => void }) {
  const p = useScanWaitPromo({ loadingStep: step, vehicleType: type, batchActive: false });
  return (
    <>
      <button type="button" onClick={onCancel}>キャンセル</button>
      <ScanWaitPromoModal promo={p.promo} onClose={p.dismiss} onLinkClick={p.markClicked} />
    </>
  );
}

const advance = (ms: number) => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};

describe("ScanWaitPromoModal", () => {
  it("PR バッジ・開示文・sponsored のリンクを出す", () => {
    render(<ScanWaitPromoModal promo={SCAN_WAIT_PROMOS[0]} onClose={() => {}} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("PR")).toBeInTheDocument();
    expect(screen.getByText(/報酬を受け取ることがあります/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "無料で見積もる" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("sponsored");
    expect(link.getAttribute("href")).toBe(SCAN_WAIT_PROMOS[0].href);
  });
  it("promo が null なら何も出さない", () => {
    render(<ScanWaitPromoModal promo={null} onClose={() => {}} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("useScanWaitPromo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
  });
  afterEach(() => vi.useRealTimers());

  it("待ち時間のあとに出て、解析が終わると自動で閉じる", () => {
    const { rerender } = render(<Harness step="analyze" />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    advance(SCAN_WAIT_PROMO_DELAY_MS);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(window.localStorage.getItem(SCAN_WAIT_PROMO_STORAGE_KEY)).not.toBeNull();
    rerender(<Harness step={null} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("待ち時間前に終われば出さず、記録もしない", () => {
    const { rerender } = render(<Harness step="analyze" />);
    advance(SCAN_WAIT_PROMO_DELAY_MS - 100);
    rerender(<Harness step={null} />);
    advance(1000);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(window.localStorage.getItem(SCAN_WAIT_PROMO_STORAGE_KEY)).toBeNull();
  });
  it("車では出さない", () => {
    render(<Harness step="analyze" type="car" />);
    advance(SCAN_WAIT_PROMO_DELAY_MS + 100);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("7 日以内に出していたら出さない", () => {
    window.localStorage.setItem(SCAN_WAIT_PROMO_STORAGE_KEY, String(Date.now()));
    render(<Harness step="analyze" />);
    advance(SCAN_WAIT_PROMO_DELAY_MS + 100);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("リンクを押しても解析のキャンセルは呼ばれない", () => {
    const onCancel = vi.fn();
    render(<Harness step="analyze" onCancel={onCancel} />);
    advance(SCAN_WAIT_PROMO_DELAY_MS);
    const link = screen.getByRole("link", { name: "無料で見積もる" });
    link.addEventListener("click", (e) => e.preventDefault());
    fireEvent.click(link);
    expect(onCancel).not.toHaveBeenCalled();
  });
  it("「閉じる」で閉じる", () => {
    render(<Harness step="analyze" />);
    advance(SCAN_WAIT_PROMO_DELAY_MS);
    fireEvent.click(screen.getAllByRole("button", { name: "閉じる" })[0]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
