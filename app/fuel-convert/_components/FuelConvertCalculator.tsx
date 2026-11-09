"use client";

import { useId, useState } from "react";
import { CalculatorField, ResetButton, SegmentedControl, type SegmentedOption } from "@/components/ui";
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

/** 燃費の単位換算機。入力は state にだけ持ち、どこにも保存しない */
export default function FuelConvertCalculator() {
  const [input, setInput] = useState<FuelConvertInput>(EMPTY);
  const baseId = useId();
  const result = computeFuelConvert(input);
  const isEmpty = input.value === "" && input.price === "" && input.unit === "kmpl";

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
        <CalculatorField
          id={`${baseId}-value`}
          label="燃費の値"
          unit={FUEL_UNIT_LABELS[input.unit]}
          unitSpace="lg"
          placeholder={PLACEHOLDERS[input.unit]}
          value={input.value}
          onChange={(value) => setInput((prev) => ({ ...prev, value }))}
          error={result.errors.value}
        />
        <CalculatorField
          id={`${baseId}-price`}
          label="ガソリン単価（任意）"
          unit="円/L"
          unitSpace="lg"
          placeholder="例: 170"
          hint="入れると 1km・100km あたりの燃料費も出します"
          value={input.price}
          onChange={(price) => setInput((prev) => ({ ...prev, price }))}
          error={result.errors.price}
        />
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
        <ResetButton onClick={() => setInput(EMPTY)} disabled={isEmpty} />
      </div>
    </div>
  );
}
