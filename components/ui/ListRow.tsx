import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

/**
 * グループリストの 1 行（最小の高さ 46px・左右 16px）。
 * - `href` があれば Next の `<Link>`、`onClick` があれば `<button>`、どちらも無ければ `<div>` で描画する。
 * - 左から leading（アイコン・日付など）/ title・subtitle / trailing（数値など）/ シェブロン。
 * - title・subtitle は 1 行に収まらなければ省略記号で切る。
 *
 * 使い方:
 *   <ListRow href="/history" title="コスモ石油" subtitle="9月11日・ハイオク" trailing={<Num>15.12</Num>} showChevron />
 */
export type ListRowProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** 右端に「›」を出す（遷移する行の目印） */
  showChevron?: boolean;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  /** 行全体の読み上げ名（title だけでは足りないとき） */
  "aria-label"?: string;
  /** `<button>` のときの `aria-current` など、追加の属性 */
  "aria-current"?: "page" | "true";
  className?: string;
};

const BASE =
  "flex w-full min-h-[46px] items-center gap-3 px-4 py-2.5 text-left text-ink";
const INTERACTIVE =
  "transition-colors hover:bg-surface-2/60 active:bg-surface-2 focus:outline-none focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50";

function RowContent({ title, subtitle, leading, trailing, showChevron }: ListRowProps) {
  return (
    <>
      {leading && <span className="flex shrink-0 items-center">{leading}</span>}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[15px]">{title}</span>
        {subtitle && <span className="truncate text-xs text-sub">{subtitle}</span>}
      </span>
      {trailing && <span className="flex shrink-0 items-center gap-1">{trailing}</span>}
      {showChevron && <ChevronRight className="h-4 w-4 shrink-0 text-faint" aria-hidden="true" />}
    </>
  );
}

export function ListRow(props: ListRowProps) {
  const { href, onClick, disabled, className = "" } = props;
  const a11y = { "aria-label": props["aria-label"], "aria-current": props["aria-current"] };
  if (href !== undefined && !disabled) {
    return (
      <Link href={href} onClick={onClick} className={`${BASE} ${INTERACTIVE} ${className}`} {...a11y}>
        <RowContent {...props} />
      </Link>
    );
  }
  if (onClick !== undefined || href !== undefined) {
    return (
      <button type="button" onClick={onClick} disabled={disabled} className={`${BASE} ${INTERACTIVE} ${className}`} {...a11y}>
        <RowContent {...props} />
      </button>
    );
  }
  return (
    <div className={`${BASE} ${className}`} {...a11y}>
      <RowContent {...props} />
    </div>
  );
}

/**
 * ラベルと値の行（左にラベル、右に値）。値は `num`（等幅数字）・太字 16px で描画し、単位や補足は `unit` に渡す。
 *
 * 使い方:
 *   <ValueRow label="給油代" value="¥4,920" tone="money" />
 *   <ValueRow label="給油量" value="29.11" unit=" L・1回" />
 *   <ValueRow label="単価" value="¥169.0" unit={<span className="text-cost-up"> 前回比 +1.0</span>} />
 */
export type ValueTone = "default" | "money" | "accent" | "up" | "cost-up" | "warn" | "sub";

const TONE_CLASS: Record<ValueTone, string> = {
  default: "text-ink",
  money: "text-money",
  accent: "text-accent",
  up: "text-up",
  "cost-up": "text-cost-up",
  warn: "text-warn",
  sub: "text-sub",
};

export type ValueRowProps = {
  label: ReactNode;
  /** 値。文字列・数値なら等幅数字で描画する。要素を渡せばそのまま描画する */
  value: ReactNode;
  /** 値の後ろに続ける単位・補足（13px・`text-sub`） */
  unit?: ReactNode;
  tone?: ValueTone;
  className?: string;
};

export function ValueRow({ label, value, unit, tone = "default", className = "" }: ValueRowProps) {
  return (
    <div className={`flex min-h-[46px] items-center justify-between gap-3 px-4 py-2 ${className}`}>
      <span className="min-w-0 text-[15px] text-ink">{label}</span>
      <span className="shrink-0 text-right">
        <span className={`num text-base font-bold ${TONE_CLASS[tone]}`}>{value}</span>
        {unit !== undefined && <span className="text-[13px] text-sub">{unit}</span>}
      </span>
    </div>
  );
}
