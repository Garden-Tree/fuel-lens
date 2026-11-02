import Link from "next/link";
import { Camera, ChevronRight } from "lucide-react";
import { aiAvailabilityCopy } from "@/lib/landingPage";
import { isTrialEnabled } from "@/lib/server/analyze/trialCookie";

// /route-gas-cost と区間ページで共有するアプリへの誘導枠

export default function RouteCta() {
  return (
    <section aria-labelledby="route-cta" className="rounded-hero border border-accent/40 bg-surface p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-accent">
          <Camera className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 id="route-cta" className="mb-1! text-base! leading-6">
            自分の車の実燃費で見積もるなら FuelLens
          </h2>
          <p className="text-sm leading-6 text-sub">
            表の燃費は一般的な目安です。FuelLens はレシートとトリップメーターが写った写真を撮るだけで、AI が給油量・金額・区間距離を読み取り、
            満タン法で実燃費を記録します。
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <Link
          href="/app"
          data-ga-cta="cta_box"
          className="inline-flex h-11 items-center justify-center gap-1 rounded-xl bg-accent px-5 text-sm font-bold text-ground transition-colors hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          アプリを使う（無料）
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
        <p className="text-xs text-sub">{aiAvailabilityCopy(isTrialEnabled()).calcNote}</p>
      </div>
    </section>
  );
}
