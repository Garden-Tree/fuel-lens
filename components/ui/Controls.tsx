import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { ChevronDown } from "lucide-react";

/**
 * 小さな操作部品: SegmentedControl（期間などの切り替え）/ Chip（絞り込み・メニューを開くボタン）/ IconButton / Num。
 * 高さはいずれも 40px（タッチ領域の下限）。
 */

export type SegmentedOption<T extends string> = {
  value: T;
  label: ReactNode;
  /** 読み上げ名（label がアイコンだけのとき） */
  ariaLabel?: string;
};

export type SegmentedControlProps<T extends string> = {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** グループの読み上げ名（例: 「期間」） */
  "aria-label": string;
  disabled?: boolean;
  className?: string;
};

/**
 * 等幅のセグメント切り替え（role="group"、各ボタンは aria-pressed）。選択中は `bg-accent-strong`・太字。
 *
 * 使い方:
 *   <SegmentedControl aria-label="期間" options={[{ value: "3m", label: "3ヶ月" }, ...]} value={period} onChange={setPeriod} />
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
  className = "",
  ...rest
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={rest["aria-label"]}
      className={`grid gap-1 rounded-xl bg-surface p-1 ${className}`}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map(option => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            aria-label={option.ariaLabel}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`h-10 min-w-0 truncate rounded-[9px] px-2 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50 ${
              selected ? "bg-accent-strong font-bold text-ink" : "text-sub hover:text-ink"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export type ChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  ref?: Ref<HTMLButtonElement>;
  /** 右端に「▾」を出す（メニュー・選択肢を開くチップ） */
  showChevron?: boolean;
  /** 選択中の見た目（枠線と文字をアクセント色にする） */
  selected?: boolean;
  /** 左端に置くアイコン */
  icon?: ReactNode;
  children: ReactNode;
};

/**
 * 角丸いっぱいのチップ型ボタン（高さ 40px・`bg-surface`・`border-border`）。中身が長いときは省略記号で切る。
 *
 * 使い方:
 *   <Chip showChevron onClick={openYearMenu}>2026年</Chip>
 */
export function Chip({ ref, showChevron = false, selected = false, icon, className = "", children, ...rest }: ChipProps) {
  return (
    <button
      ref={ref}
      type="button"
      className={`inline-flex h-10 min-w-0 max-w-full items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50 ${
        selected ? "border-accent bg-surface text-accent" : "border-border bg-surface text-ink hover:bg-surface-2"
      } ${className}`}
      {...rest}
    >
      {icon && <span className="flex shrink-0 items-center text-sub">{icon}</span>}
      <span className="min-w-0 truncate">{children}</span>
      {showChevron && <ChevronDown className="h-4 w-4 shrink-0 text-sub" aria-hidden="true" />}
    </button>
  );
}

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "aria-label"> & {
  ref?: Ref<HTMLButtonElement>;
  /** 読み上げ名（アイコンだけのボタンなので必須） */
  "aria-label": string;
  /** outline: 枠線付きの丸（既定）/ ghost: 枠なし */
  variant?: "outline" | "ghost";
  children: ReactNode;
};

/**
 * 40×40 の丸いアイコンボタン。`aria-label` は必須。
 *
 * 使い方:
 *   <IconButton aria-label="CSVで書き出す" onClick={exportCsv}><Download className="h-[18px] w-[18px]" /></IconButton>
 */
export function IconButton({ ref, variant = "outline", className = "", children, ...rest }: IconButtonProps) {
  return (
    <button
      ref={ref}
      type="button"
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50 ${
        variant === "outline"
          ? "border border-border bg-surface text-[#B8C3CF] hover:bg-surface-2 hover:text-ink"
          : "text-sub hover:bg-surface-2 hover:text-ink"
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/**
 * 数値の表示（`num` ユーティリティ = JetBrains Mono + tabular-nums）。
 *
 * 使い方: <Num className="text-lg font-bold">15.12</Num>
 */
export function Num({ className = "", children }: { className?: string; children: ReactNode }) {
  return <span className={`num ${className}`}>{children}</span>;
}
