import { Fuel } from "lucide-react";

/** FuelLens のロゴ（給油機のアイコン・アクセント色）とワードマーク */
export function BrandMark({ showWordmark = true, className = "" }: { showWordmark?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-bold text-ink ${className}`}>
      <Fuel className="h-6 w-6 shrink-0 text-accent" strokeWidth={2} aria-hidden="true" />
      {showWordmark && <span className="tracking-tight">FuelLens</span>}
    </span>
  );
}
