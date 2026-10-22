import Link from "next/link";
import { X } from "lucide-react";

import { primaryButtonClass, secondaryButtonClass } from "@/components/settingsUi";
import { IconButton } from "@/components/ui";

export interface ImportNextStepCardProps {
  /** 追加した記録の件数 */
  recordsAdded: number;
  /** 追加した車両の台数 */
  vehiclesAdded: number;
  /** 取り込み先がオドメーター入力方式の車両（Fuelio など）か。true ならオドメーターを撮る案内にする */
  odometerMode: boolean;
  onDismiss: () => void;
}

/**
 * 取り込みが終わった後に、次の給油からの記録方法（写真 1 枚）を案内する小さなカード。
 * 記録が 1 件も追加されなかったとき・失敗したときは呼び出し側が出さない。
 */
export default function ImportNextStepCard({
  recordsAdded,
  vehiclesAdded,
  odometerMode,
  onDismiss,
}: ImportNextStepCardProps) {
  const photo = odometerMode ? "レシートとメーターパネル（オドメーター）" : "レシートとトリップメーター";
  return (
    <section aria-labelledby="import-next-step-title" className="rounded-2xl border border-border bg-surface-2 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id="import-next-step-title" className="text-sm font-bold text-ink">
            取り込みが終わりました
          </h3>
          <p className="num mt-0.5 text-xs text-sub">
            記録 {recordsAdded} 件{vehiclesAdded > 0 ? `・車両 ${vehiclesAdded} 台` : ""}を追加しました
          </p>
        </div>
        <IconButton aria-label="閉じる" variant="ghost" onClick={onDismiss}>
          <X className="h-[18px] w-[18px]" aria-hidden="true" />
        </IconButton>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-ink">
        次の給油からは、{photo}を 1 枚に撮るだけで記録できます。
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Link href="/app" className={primaryButtonClass}>
          記録の画面へ
        </Link>
        <Link href="/history" className={secondaryButtonClass}>
          履歴を見る
        </Link>
      </div>
    </section>
  );
}
