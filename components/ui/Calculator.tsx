import type { ReactNode } from "react";
import { RotateCcw } from "lucide-react";

/**
 * 公開の計算ツール（/calc・/gas-cost・/annual-gas-cost・/fuel-convert・/warikan）の部品:
 * CalculatorField（ラベル付きの数値入力）/ ResultItem（結果の 1 項目）/ ResetButton（入力のリセット）。
 * 状態は持たない（値と onChange は呼び出し側の state）。
 */

/** 単位の表示幅に合わせた入力欄の右余白。sm = 「km」「L」程度、md = 「km/L」「円/L」、lg = 「mpg (US)」のような長い単位 */
export type CalculatorUnitSpace = "sm" | "md" | "lg";

const UNIT_SPACE_CLASS: Record<CalculatorUnitSpace, string> = { sm: "pr-10", md: "pr-12", lg: "pr-20" };

export type CalculatorFieldProps = {
  /** input の id。補足は `${id}-hint`、エラーは `${id}-error` */
  id: string;
  label: ReactNode;
  /** 入力欄の右端に重ねる単位 */
  unit: ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** 欄の下の補足。無ければ出さない */
  hint?: ReactNode;
  /** エラー文（日本語）。あれば aria-invalid と赤枠 */
  error?: string;
  inputMode?: "decimal" | "numeric";
  unitSpace?: CalculatorUnitSpace;
};

/**
 * ラベル・入力欄・単位・補足・エラーの 1 組。aria-describedby は補足とエラーの id を（ある方だけ）つなぐ。
 *
 * 使い方:
 *   <CalculatorField id={`${baseId}-distance`} label="走行距離" unit="km" value={input.distance}
 *     onChange={(distance) => setInput((prev) => ({ ...prev, distance }))} hint="…" error={result.errors.distance} />
 */
export function CalculatorField({
  id,
  label,
  unit,
  value,
  onChange,
  placeholder,
  hint,
  error,
  inputMode = "decimal",
  unitSpace = "md",
}: CalculatorFieldProps) {
  const describedBy = [hint != null ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ");
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
      </label>
      <div className="relative mt-1.5">
        <input
          id={id}
          type="text"
          inputMode={inputMode}
          autoComplete="off"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={`num h-11 w-full min-w-0 rounded-xl border bg-ground pl-3 ${UNIT_SPACE_CLASS[unitSpace]} text-base text-ink placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
            error ? "border-red-500" : "border-border"
          }`}
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[13px] text-sub">{unit}</span>
      </div>
      {hint != null && (
        <p id={`${id}-hint`} className="mt-1 text-xs leading-relaxed text-sub">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

export type ResultItemProps = {
  label: ReactNode;
  unit: ReactNode;
  /** 表示する値（整形済み）。null なら「--」を薄く出す */
  value: string | null;
  /** 値があるときの文字色（例: "text-money"・"text-accent"） */
  tone: string;
  /** 主要な結果（文字を一回り大きくする） */
  large?: boolean;
};

/**
 * 結果の 1 項目（`<dl>` の中に並べる dt + dd）。狭い画面では横並び、sm 以上では縦に積む。
 *
 * 使い方:
 *   <dl className="grid … sm:grid-cols-3"><ResultItem label="燃費" unit="km/L" value={result.efficiency} tone="text-accent" large /></dl>
 */
export function ResultItem({ label, unit, value, tone, large = false }: ResultItemProps) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 py-3 sm:block">
      <dt className="text-[13px] text-sub">{label}</dt>
      <dd className="flex items-baseline gap-1 sm:mt-1">
        <span className={`num font-bold ${large ? "text-2xl" : "text-xl"} ${value != null ? tone : "text-faint"}`}>
          {value ?? "--"}
        </span>
        <span className="text-[13px] text-sub">{unit}</span>
      </dd>
    </div>
  );
}

export type ResetButtonProps = {
  onClick: () => void;
  /** 入力が空のときは押せないようにする */
  disabled?: boolean;
};

/** 「リセット」ボタン（高さ 44px、アイコン付き）。計算機の下端の「入力した値は保存されません。」の横に置く */
export function ResetButton({ onClick, disabled = false }: ResetButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-border bg-surface-2 px-4 text-sm font-bold text-ink transition-colors hover:bg-line focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
    >
      <RotateCcw className="h-4 w-4" aria-hidden="true" />
      リセット
    </button>
  );
}
