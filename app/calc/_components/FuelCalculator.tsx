"use client";

import { useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { NotebookPen, RotateCcw } from "lucide-react";
import { calcRecordHref, computeCalc, type CalcField, type CalcInput } from "@/lib/calcPage";

const EMPTY: CalcInput = { distance: "", amount: "", cost: "" };

const FIELDS: { field: CalcField; label: string; unit: string; placeholder: string; hint: string }[] = [
  { field: "distance", label: "走行距離", unit: "km", placeholder: "例: 400", hint: "前回の満タン給油からの区間距離（トリップメーター）" },
  { field: "amount", label: "給油量", unit: "L", placeholder: "例: 25", hint: "今回、満タンまで入れた量" },
  { field: "cost", label: "支払総額（任意）", unit: "円", placeholder: "例: 4000", hint: "入れると単価と 1km あたりの燃料費も出ます" },
];

/**
 * 満タン法の燃費計算機。入力は state にだけ持ち、どこにも保存しない。
 * 結果が出たら「この内容で FuelLens に記録する」で、アプリの手動入力を事前入力つきで開ける（calcRecordHref。
 * ただのリンクなので、このページはアプリのコード・Clerk・Supabase を読み込まない）
 */
export default function FuelCalculator() {
  const [input, setInput] = useState<CalcInput>(EMPTY);
  const baseId = useId();
  const result = computeCalc(input);
  const recordHref = calcRecordHref(input);
  const isEmpty = input.distance === "" && input.amount === "" && input.cost === "";

  return (
    <div className="rounded-hero border border-line bg-surface p-4 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {FIELDS.map(({ field, label, unit, placeholder, hint }) => {
          const id = `${baseId}-${field}`;
          const error = result.errors[field];
          return (
            <div key={field} className="min-w-0">
              <label htmlFor={id} className="block text-sm font-medium text-ink">
                {label}
              </label>
              <div className="relative mt-1.5">
                <input
                  id={id}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder={placeholder}
                  value={input[field]}
                  onChange={(e) => setInput((prev) => ({ ...prev, [field]: e.target.value }))}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
                  className={`num h-11 w-full min-w-0 rounded-xl border bg-ground pl-3 pr-10 text-base text-ink placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    error ? "border-red-500" : "border-border"
                  }`}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[13px] text-sub">{unit}</span>
              </div>
              <p id={`${id}-hint`} className="mt-1 text-xs leading-relaxed text-sub">
                {hint}
              </p>
              {error && (
                <p id={`${id}-error`} className="mt-1 text-xs text-red-400">
                  {error}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div aria-live="polite" className="mt-5">
        <dl className="grid grid-cols-1 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-ground sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <ResultItem label="燃費" unit="km/L" value={result.efficiency} tone="text-accent" large />
          <ResultItem label="単価" unit="円/L" value={result.pricePerUnit} tone="text-money" />
          <ResultItem label="1kmあたりの燃料費" unit="円/km" value={result.costPerKm} tone="text-money" />
        </dl>
        {result.warning && <p className="mt-3 text-xs leading-relaxed text-warn">{result.warning}</p>}
      </div>

      {recordHref && (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <p className="text-xs leading-relaxed text-sub">
            アプリの手動入力に入れて、日付と車両を確認してから保存します（登録不要）。
          </p>
          {/* 入力のたびに URL が変わるので先読みしない（/app はログイン状態を読む動的な画面） */}
          <Link
            href={recordHref}
            data-ga-cta="calc_result"
            prefetch={false}
            className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-accent/50 bg-surface-2 px-4 text-sm font-bold text-accent transition-colors hover:bg-line focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <NotebookPen className="h-4 w-4" aria-hidden="true" />
            この内容で FuelLens に記録する
          </Link>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs text-sub">入力した値は保存されません。</p>
        <button
          type="button"
          onClick={() => setInput(EMPTY)}
          disabled={isEmpty}
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-border bg-surface-2 px-4 text-sm font-bold text-ink transition-colors hover:bg-line focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          リセット
        </button>
      </div>
    </div>
  );
}

function ResultItem({
  label,
  unit,
  value,
  tone,
  large = false,
}: {
  label: string;
  unit: string;
  value: string | null;
  tone: string;
  large?: boolean;
}): ReactNode {
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
