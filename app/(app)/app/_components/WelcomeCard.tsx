import { Fuel } from "lucide-react";
import type { DistanceMode } from "@/lib/types";

/** 記録が 1 件も無いときのヒーロー（入口の 3 項目は ScanEntryList を下に並べる） */
export default function WelcomeCard({ distanceMode }: { distanceMode: DistanceMode }) {
  return (
    <section className="flex w-full flex-col items-center gap-3 rounded-hero bg-surface px-5 py-7 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-strong">
        <Fuel className="h-6 w-6 text-accent" aria-hidden="true" />
      </span>
      <h2 className="text-lg font-bold text-ink">最初の給油を記録しましょう</h2>
      <p className="max-w-[320px] text-[13px] leading-relaxed text-sub">
        レシートと{distanceMode === "odometer" ? "オドメーター" : "トリップメーター"}
        を1枚に収めて撮影すると、AIが読み取って燃費を計算します。過去の記録は手動でも入力できます。
      </p>
    </section>
  );
}
