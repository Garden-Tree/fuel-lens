"use client";

import { useEffect, useState } from "react";
import type { ScanLoadingStep } from "@/lib/scan/useScanPipeline";
import type { VehicleType } from "@/lib/types";
import { trackEvent } from "@/lib/analytics/events";
import {
  SCAN_WAIT_PROMO_DELAY_MS,
  decideScanWaitPromo,
  findScanWaitPromo,
  readPromoShownAt,
  writePromoShownAt,
  type ScanWaitPromo,
} from "./scanWait";

/**
 * 解析待ちの提携先の紹介を出すか。エラー・キャンセルで解析が終わると自動で閉じる。
 * 結果が出たときは閉じず（done=true）、ユーザーが閉じるまで出し続ける（結果の確認シートはその後に出す）。
 * 出した時刻を端末に記録し、7 日間は再び出さない。
 * 表示とリンクのクリックを GA4 に送る（promo_impression / promo_click。lib/analytics/events.ts）。
 */
export function useScanWaitPromo({
  loadingStep,
  vehicleType,
  batchActive,
  resultReady,
}: {
  loadingStep: ScanLoadingStep;
  vehicleType: VehicleType | null | undefined;
  batchActive: boolean;
  /** 解析結果（確認シートに出す内容）が届いているか */
  resultReady: boolean;
}) {
  const [shown, setShown] = useState<{ promo: ScanWaitPromo; dismissed: boolean } | null>(null);
  const eligible = loadingStep === "analyze" && !batchActive && findScanWaitPromo(vehicleType) !== null;

  useEffect(() => {
    if (!eligible) return;
    const timer = window.setTimeout(() => {
      const now = Date.now();
      const promo = decideScanWaitPromo({
        loadingStep: "analyze",
        elapsedMs: SCAN_WAIT_PROMO_DELAY_MS,
        vehicleType,
        batchActive,
        lastShownAt: readPromoShownAt(),
        now,
      });
      if (!promo || !vehicleType) return;
      writePromoShownAt(now);
      setShown({ promo, dismissed: false });
      trackEvent("promo_impression", { promo_id: promo.id, vehicle_type: vehicleType });
    }, SCAN_WAIT_PROMO_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [eligible, vehicleType, batchActive]);

  // 解析が終わり、見せる結果もない（エラー・キャンセル、または結果を確認し終えた）ら閉じる
  if (!eligible && !resultReady && shown) setShown(null);

  const done = !eligible;
  return {
    promo: shown && !shown.dismissed && (eligible || resultReady) ? shown.promo : null,
    /** 解析が終わって結果が待っている状態 */
    done,
    dismiss: () => setShown((s) => (s ? { ...s, dismissed: true } : s)),
    /** リンクを押したときも時刻を記録する（解析は止めない） */
    markClicked: () => {
      writePromoShownAt(Date.now());
      if (shown && vehicleType) trackEvent("promo_click", { promo_id: shown.promo.id, vehicle_type: vehicleType });
    },
  };
}
