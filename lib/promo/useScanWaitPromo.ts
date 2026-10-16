"use client";

import { useEffect, useState } from "react";
import type { ScanLoadingStep } from "@/lib/scan/useScanPipeline";
import type { VehicleType } from "@/lib/types";
import {
  SCAN_WAIT_PROMO_DELAY_MS,
  decideScanWaitPromo,
  findScanWaitPromo,
  readPromoShownAt,
  writePromoShownAt,
  type ScanWaitPromo,
} from "./scanWait";

/**
 * 解析待ちの提携先の紹介を出すか。解析が終わる（結果・エラー・キャンセル）と自動で閉じる。
 * 出した時刻を端末に記録し、7 日間は再び出さない。
 */
export function useScanWaitPromo({
  loadingStep,
  vehicleType,
  batchActive,
}: {
  loadingStep: ScanLoadingStep;
  vehicleType: VehicleType | null | undefined;
  batchActive: boolean;
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
      if (!promo) return;
      writePromoShownAt(now);
      setShown({ promo, dismissed: false });
    }, SCAN_WAIT_PROMO_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      // 解析が終わった（または対象外になった）ら閉じる
      setShown(null);
    };
  }, [eligible, vehicleType, batchActive]);

  return {
    promo: shown && !shown.dismissed && eligible ? shown.promo : null,
    dismiss: () => setShown((s) => (s ? { ...s, dismissed: true } : s)),
    /** リンクを押したときも時刻を記録する（解析は止めない） */
    markClicked: () => writePromoShownAt(Date.now()),
  };
}
