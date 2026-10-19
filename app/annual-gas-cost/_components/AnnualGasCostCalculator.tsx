"use client";

import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { SegmentedControl, type SegmentedOption } from "@/components/ui";
import {
  DEFAULT_COMMUTE_DAYS,
  computeAnnualGasCost,
  type AnnualGasCostField,
  type AnnualGasCostInput,
  type AnnualMode,
  type DistancePeriod,
} from "@/lib/annualGasCostPage";

const EMPTY: AnnualGasCostInput = {
  mode: "distance",
  distance: "",
  period: "month",
  oneWay: "",
  days: DEFAULT_COMMUTE_DAYS,
  efficiency: "",
  price: "",
};

const MODE_OPTIONS: readonly SegmentedOption<AnnualMode>[] = [
  { value: "distance", label: "距離から" },
  { value: "commute", label: "通勤から" },
];

const PERIOD_OPTIONS: readonly SegmentedOption<DistancePeriod>[] = [
  { value: "month", label: "月" },
  { value: "year", label: "年" },
];

type FieldDef = {
  field: AnnualGasCostField;
  label: string;
  unit: string;
  placeholder: string;
  hint: ReactNode;
  inputMode: "decimal" | "numeric";
};

const DISTANCE_FIELD: FieldDef = {
  field: "distance",
  label: "走行距離",
  unit: "km",
  placeholder: "例: 800",
  hint: "下の「月」「年」で、入力する期間を選びます",
  inputMode: "decimal",
};
const ONE_WAY_FIELD: FieldDef = {
  field: "oneWay",
  label: "片道の距離",
  unit: "km",
  placeholder: "例: 15",
  hint: "自宅から職場までの片道の距離",
  inputMode: "decimal",
};
const DAYS_FIELD: FieldDef = {
  field: "days",
  label: "月の出勤日数",
  unit: "日",
  placeholder: "例: 20",
  hint: "1〜31 の整数。片道 × 2 × 日数で月の距離を出します",
  inputMode: "numeric",
};
const EFFICIENCY_FIELD: FieldDef = {
  field: "efficiency",
  label: "燃費",
  unit: "km/L",
  placeholder: "例: 15",
  hint: (
    <>
      実燃費がわからなければ、
      <Link href="/calc" className="text-accent underline underline-offset-2 hover:no-underline">
        満タン法の燃費計算ツール
      </Link>
      で測れます
    </>
  ),
  inputMode: "decimal",
};
const PRICE_FIELD: FieldDef = {
  field: "price",
  label: "ガソリン単価",
  unit: "円/L",
  placeholder: "例: 170",
  hint: "給油するスタンドの 1L あたりの価格。単価は時期で変わります",
  inputMode: "decimal",
};

/** 年間・月間のガソリン代の計算機。入力は state にだけ持ち、どこにも保存しない */
export default function AnnualGasCostCalculator() {
  const [input, setInput] = useState<AnnualGasCostInput>(EMPTY);
  const baseId = useId();
  const result = computeAnnualGasCost(input);
  const isEmpty =
    input.mode === "distance" &&
    input.period === "month" &&
    input.distance === "" &&
    input.oneWay === "" &&
    input.days === DEFAULT_COMMUTE_DAYS &&
    input.efficiency === "" &&
    input.price === "";

  const renderField = ({ field, label, unit, placeholder, hint, inputMode }: FieldDef) => {
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
            inputMode={inputMode}
            autoComplete="off"
            placeholder={placeholder}
            value={input[field]}
            onChange={(e) => setInput((prev) => ({ ...prev, [field]: e.target.value }))}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
            className={`num h-11 w-full min-w-0 rounded-xl border bg-ground pl-3 pr-12 text-base text-ink placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
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
  };

  return (
    <div className="rounded-hero border border-line bg-surface p-4 sm:p-6">
      <SegmentedControl
        aria-label="計算のしかた"
        options={MODE_OPTIONS}
        value={input.mode}
        onChange={(mode) => setInput((prev) => ({ ...prev, mode }))}
        className="border border-border bg-ground!"
      />

      {input.mode === "distance" ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="min-w-0">
            {renderField(DISTANCE_FIELD)}
            <SegmentedControl
              aria-label="走行距離の期間"
              options={PERIOD_OPTIONS}
              value={input.period}
              onChange={(period) => setInput((prev) => ({ ...prev, period }))}
              className="mt-2 border border-border bg-ground!"
            />
          </div>
          {renderField(EFFICIENCY_FIELD)}
          {renderField(PRICE_FIELD)}
        </div>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {renderField(ONE_WAY_FIELD)}
          {renderField(DAYS_FIELD)}
          {renderField(EFFICIENCY_FIELD)}
          {renderField(PRICE_FIELD)}
        </div>
      )}

      <div aria-live="polite" className="mt-5">
        <dl className="grid grid-cols-1 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-ground sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <ResultItem label="1か月のガソリン代" unit="円" value={result.monthlyCost} tone="text-money" large />
          <ResultItem label="1年のガソリン代" unit="円" value={result.yearlyCost} tone="text-money" large />
        </dl>
        <dl className="mt-3 grid grid-cols-1 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-ground sm:grid-cols-2 sm:divide-y-0 sm:divide-x [&>*:nth-child(n+3)]:sm:border-t [&>*:nth-child(n+3)]:sm:border-line">
          <ResultItem label="月間の走行距離" unit="km" value={result.monthlyDistance} tone="text-accent" />
          <ResultItem label="年間の走行距離" unit="km" value={result.yearlyDistance} tone="text-accent" />
          <ResultItem label="月間の給油量" unit="L" value={result.monthlyFuel} tone="text-accent" />
          <ResultItem label="1kmあたりのガソリン代" unit="円/km" value={result.costPerKm} tone="text-money" />
        </dl>
        <p className="mt-3 text-xs leading-relaxed text-sub">
          1年のガソリン代は、今の単価が 1 年続いた場合の目安です（1か月のガソリン代 × 12）。
        </p>
        {result.warnings.map((warning) => (
          <p key={warning} className="mt-3 text-xs leading-relaxed text-warn">
            {warning}
          </p>
        ))}
      </div>

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
