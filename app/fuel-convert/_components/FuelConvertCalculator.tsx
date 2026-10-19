"use client";

import { useId, useState } from "react";
import { RotateCcw } from "lucide-react";
import { SegmentedControl, type SegmentedOption } from "@/components/ui";
import {
  FUEL_UNITS,
  FUEL_UNIT_BETTER,
  FUEL_UNIT_LABELS,
  computeFuelConvert,
  type FuelConvertInput,
  type FuelUnit,
} from "@/lib/fuelConvertPage";

const EMPTY: FuelConvertInput = { value: "", unit: "kmpl", price: "" };

const UNIT_OPTIONS: readonly SegmentedOption<FuelUnit>[] = FUEL_UNITS.map((unit) => ({
  value: unit,
  label: FUEL_UNIT_LABELS[unit],
}));

const PLACEHOLDERS: Record<FuelUnit, string> = { kmpl: "例: 15", l100km: "例: 6.7", mpgUs: "例: 35", mpgUk: "例: 42" };

const inputClass = (error: boolean) =>
  `num h-11 w-full min-w-0 rounded-xl border bg-ground pl-3 pr-20 text-base text-ink placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
    error ? "border-red-500" : "border-border"
  }`;

/** 燃費の単位換算機。入力は state にだけ持ち、どこにも保存しない */
export default function FuelConvertCalculator() {
  const [input, setInput] = useState<FuelConvertInput>(EMPTY);
  const baseId = useId();
  const result = computeFuelConvert(input);
  const isEmpty = input.value === "" && input.price === "" && input.unit === "kmpl";
  const valueId = `${baseId}-value`;
  const priceId = `${baseId}-price`;

  return (
    <div className="rounded-hero border border-line bg-surface p-4 sm:p-6">
      <div>
        <p className="text-sm font-medium text-ink">入力する単位</p>
        <SegmentedControl
          aria-label="入力する単位"
          options={UNIT_OPTIONS}
          value={input.unit}
          onChange={(unit) => setInput((prev) => ({ ...prev, unit }))}
          className="mt-1.5 border border-border bg-ground!"
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="min-w-0">
          <label htmlFor={valueId} className="block text-sm font-medium text-ink">
            燃費の値
          </label>
          <div className="relative mt-1.5">
            <input
              id={valueId}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder={PLACEHOLDERS[input.unit]}
              value={input.value}
              onChange={(e) => setInput((prev) => ({ ...prev, value: e.target.value }))}
              aria-invalid={result.errors.value ? true : undefined}
              aria-describedby={result.errors.value ? `${valueId}-error` : undefined}
              className={inputClass(!!result.errors.value)}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[13px] text-sub">
              {FUEL_UNIT_LABELS[input.unit]}
            </span>
          </div>
          {result.errors.value && (
            <p id={`${valueId}-error`} className="mt-1 text-xs text-red-400">
              {result.errors.value}
            </p>
          )}
        </div>
        <div className="min-w-0">
          <label htmlFor={priceId} className="block text-sm font-medium text-ink">
            ガソリン単価（任意）
          </label>
          <div className="relative mt-1.5">
            <input
              id={priceId}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="例: 170"
              value={input.price}
              onChange={(e) => setInput((prev) => ({ ...prev, price: e.target.value }))}
              aria-invalid={result.errors.price ? true : undefined}
              aria-describedby={`${priceId}-hint${result.errors.price ? ` ${priceId}-error` : ""}`}
              className={inputClass(!!result.errors.price)}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[13px] text-sub">円/L</span>
          </div>
          <p id={`${priceId}-hint`} className="mt-1 text-xs leading-relaxed text-sub">
            入れると 1km・100km あたりの燃料費も出します
          </p>
          {result.errors.price && (
            <p id={`${priceId}-error`} className="mt-1 text-xs text-red-400">
              {result.errors.price}
            </p>
          )}
        </div>
      </div>

      <div aria-live="polite" className="mt-5">
        <div className="overflow-x-auto rounded-2xl border border-line bg-ground">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">換算結果</caption>
            <thead>
              <tr className="border-b border-line text-sub">
                <th scope="col" className="px-3 py-2.5 text-left font-medium">単位</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">値</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">よい燃費</th>
              </tr>
            </thead>
            <tbody>
              {FUEL_UNITS.map((unit) => {
                const isInput = unit === input.unit;
                const value = result.values?.[unit] ?? null;
                return (
                  <tr
                    key={unit}
                    data-input-row={isInput ? "true" : undefined}
                    className={`border-b border-line last:border-b-0 ${isInput ? "bg-surface-2" : ""}`}
                  >
                    <th scope="row" className="whitespace-nowrap px-3 py-3 text-left font-medium text-ink">
                      {FUEL_UNIT_LABELS[unit]}
                      {isInput && <span className="ml-2 text-xs font-normal text-accent">入力</span>}
                    </th>
                    <td className="px-3 py-3 text-right">
                      <span className={`num text-xl font-bold ${value != null ? (isInput ? "text-accent" : "text-ink") : "text-faint"}`}>
                        {value ?? "--"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-xs text-sub">{FUEL_UNIT_BETTER[unit]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {result.costPerKm != null && result.costPer100km != null && (
          <dl className="mt-3 grid grid-cols-1 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-ground sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            <div className="flex items-baseline justify-between gap-3 px-4 py-3">
              <dt className="text-[13px] text-sub">1kmあたりの燃料費</dt>
              <dd className="flex items-baseline gap-1">
                <span className="num text-xl font-bold text-money">{result.costPerKm}</span>
                <span className="text-[13px] text-sub">円/km</span>
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 px-4 py-3">
              <dt className="text-[13px] text-sub">100kmあたりの燃料費</dt>
              <dd className="flex items-baseline gap-1">
                <span className="num text-xl font-bold text-money">{result.costPer100km}</span>
                <span className="text-[13px] text-sub">円</span>
              </dd>
            </div>
          </dl>
        )}
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
