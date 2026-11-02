"use client";

import Link from "next/link";
import { useEffect, useId, useState, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { SegmentedControl, type SegmentedOption } from "@/components/ui";
import {
  EXAMPLE_HIGH_OCTANE_PRICE,
  EXAMPLE_PRICE,
  NATIONAL_PRICE_SURVEY_LABEL,
  computeGasCost,
  formatPrice,
  parseDistancePrefill,
  type GasCostField,
  type GasCostInput,
} from "@/lib/gasCostPage";
import { NATIONAL_GAS_PRICE } from "@/lib/nationalGasPrice";
import { findToolPagePromo, litersFromDisplay } from "@/lib/promo/toolPage";
import ToolPagePromoCard from "@/components/ToolPagePromoCard";

const EMPTY: GasCostInput = { distance: "", efficiency: "", price: "", people: "", roundTrip: false };

type TripValue = "oneway" | "round";
const TRIP_OPTIONS: readonly SegmentedOption<TripValue>[] = [
  { value: "oneway", label: "片道" },
  { value: "round", label: "往復" },
];

type FieldDef = {
  field: GasCostField;
  label: string;
  unit: string;
  placeholder: string;
  hint: ReactNode;
  inputMode: "decimal" | "numeric";
};

const MAIN_FIELDS: FieldDef[] = [
  { field: "distance", label: "走行距離", unit: "km", placeholder: "例: 300", hint: "目的地までの距離（片道）", inputMode: "decimal" },
  {
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
  },
  { field: "price", label: "ガソリン単価", unit: "円/L", placeholder: `例: ${formatPrice(EXAMPLE_PRICE)}`, hint: "給油するスタンドの 1L あたりの価格", inputMode: "decimal" },
];

/** 単価の欄に全国平均を入れるボタン */
const NATIONAL_PRICE_BUTTONS = [
  { label: "レギュラーを入れる", price: EXAMPLE_PRICE },
  { label: "ハイオクを入れる", price: EXAMPLE_HIGH_OCTANE_PRICE },
] as const;

const PROMO = findToolPagePromo("/gas-cost");

const PEOPLE_FIELD: FieldDef = {
  field: "people",
  label: "人数（任意）",
  unit: "人",
  placeholder: "例: 3",
  hint: "2 人以上なら割り勘の 1 人あたりも出します",
  inputMode: "numeric",
};

/** ガソリン代の計算機。入力は state にだけ持ち、どこにも保存しない */
export default function GasCostCalculator() {
  const [input, setInput] = useState<GasCostInput>(EMPTY);
  const baseId = useId();
  // 距離別の目安表のリンク（`?km=300`）から来たときは、距離だけ入れておく。ページ自体は静的なので、マウント後に読む
  useEffect(() => {
    const km = parseDistancePrefill(window.location.search);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- URL はサーバーで読めないため、マウント後に一度だけ反映する
    if (km) setInput((prev) => (prev.distance === "" ? { ...prev, distance: km } : prev));
  }, []);
  const result = computeGasCost(input);
  const isEmpty =
    input.distance === "" && input.efficiency === "" && input.price === "" && input.people === "" && !input.roundTrip;

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
      <div className="grid gap-4 sm:grid-cols-3">{MAIN_FIELDS.map(renderField)}</div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-line bg-ground px-3 py-2">
        <p className="min-w-0 flex-1 basis-60 text-xs leading-relaxed text-sub">
          全国平均 レギュラー <span className="num text-ink">{formatPrice(EXAMPLE_PRICE)}</span>円/L・ハイオク{" "}
          <span className="num text-ink">{formatPrice(EXAMPLE_HIGH_OCTANE_PRICE)}</span>円/L（
          <a
            href={NATIONAL_GAS_PRICE.sourceUrl}
            target="_blank"
            rel="noopener"
            className="text-accent underline underline-offset-2 hover:no-underline"
          >
            資源エネルギー庁
          </a>
          、{NATIONAL_PRICE_SURVEY_LABEL}調査）
        </p>
        <div role="group" aria-label="全国平均を単価に入れる" className="flex shrink-0 gap-2">
          {NATIONAL_PRICE_BUTTONS.map(({ label, price }) => (
            <button
              key={label}
              type="button"
              onClick={() => setInput((prev) => ({ ...prev, price: formatPrice(price) }))}
              className="inline-flex h-9 items-center rounded-lg border border-border bg-surface-2 px-3 text-xs font-bold text-ink transition-colors hover:bg-line focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div className="min-w-0 sm:col-span-2">
          <p className="text-sm font-medium text-ink">片道・往復</p>
          <SegmentedControl
            aria-label="片道・往復"
            options={TRIP_OPTIONS}
            value={input.roundTrip ? "round" : "oneway"}
            onChange={(value) => setInput((prev) => ({ ...prev, roundTrip: value === "round" }))}
            className="mt-1.5 border border-border bg-ground!"
          />
          <p className="mt-1 text-xs leading-relaxed text-sub">往復なら、片道の距離を 2 倍にして計算します</p>
        </div>
        {renderField(PEOPLE_FIELD)}
      </div>

      <div aria-live="polite" className="mt-5">
        <dl className="grid grid-cols-1 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-ground sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <ResultItem label="ガソリン代" unit="円" value={result.cost} tone="text-money" large />
          <ResultItem label="必要なガソリン量" unit="L" value={result.fuel} tone="text-accent" />
          <ResultItem label="1kmあたりのガソリン代" unit="円/km" value={result.costPerKm} tone="text-money" />
        </dl>
        {result.perPerson != null && result.people != null && (
          <p className="mt-3 flex flex-wrap items-baseline gap-x-2 rounded-2xl border border-line bg-ground px-4 py-3 text-sm text-sub">
            <span>
              <span className="num">{result.people}</span> 人で割り勘すると 1 人あたり
            </span>
            <span className="flex items-baseline gap-1">
              <span className="num text-xl font-bold text-money">{result.perPerson}</span>
              <span className="text-[13px]">円</span>
            </span>
            <span className="text-xs">（1 円未満は切り上げ）</span>
          </p>
        )}
        {result.totalDistance != null && (
          <p className="mt-3 text-xs text-sub">
            計算に使った距離: <span className="num text-ink">{result.totalDistance}</span> km
            {input.roundTrip ? "（往復）" : "（片道）"}
          </p>
        )}
        {result.warnings.map((warning) => (
          <p key={warning} className="mt-3 text-xs leading-relaxed text-warn">
            {warning}
          </p>
        ))}
      </div>
      {/* 読み上げの対象（aria-live）の外に置き、入力のたびに PR を読み上げないようにする */}
      <ToolPagePromoCard
        promo={PROMO}
        page="/gas-cost"
        liters={Object.keys(result.errors).length === 0 ? litersFromDisplay(result.fuel) : null}
      />

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
