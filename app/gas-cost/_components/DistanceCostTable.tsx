"use client";

import { useState } from "react";
import { SegmentedControl, type SegmentedOption } from "@/components/ui";
import {
  CAR_TYPE_EFFICIENCIES,
  FUEL_GRADES,
  distanceCostTable,
  distanceLink,
  type FuelGradeId,
} from "@/lib/gasCostPage";

const GRADE_OPTIONS: readonly SegmentedOption<FuelGradeId>[] = FUEL_GRADES.map((g) => ({ value: g.id, label: g.label }));

/**
 * 距離別・車種別のガソリン代の目安表（レギュラー / ハイオクの切り替え）。
 * 両方の表を静的に描画しておき、選んでいないほうを hidden にする（JS が動く前もレギュラーの表は読める）
 */
export default function DistanceCostTable() {
  const [grade, setGrade] = useState<FuelGradeId>("regular");
  return (
    <div className="mt-3">
      <SegmentedControl
        aria-label="燃料の種類"
        options={GRADE_OPTIONS}
        value={grade}
        onChange={setGrade}
        className="max-w-xs border border-border bg-ground!"
      />
      {FUEL_GRADES.map(({ id, label, price }) => (
        <div key={id} hidden={id !== grade} className="mt-3 overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full border-collapse text-right text-sm">
            <caption className="sr-only">
              距離別・車種別のガソリン代（円）。{label} {price} 円/L の例
            </caption>
            <thead>
              <tr className="border-b border-line text-sub">
                <th scope="col" className="px-1.5 py-2.5 text-left align-bottom font-medium">
                  距離
                  <span className="mt-0.5 block text-[11px]">金額は円</span>
                </th>
                {CAR_TYPE_EFFICIENCIES.map(({ id: carId, label: carLabel, efficiency }) => (
                  <th key={carId} scope="col" className="px-1.5 py-2.5 align-bottom text-xs font-medium leading-tight">
                    {carLabel}
                    <span className="mt-0.5 block whitespace-nowrap text-[11px]">
                      約<span className="num">{efficiency}</span>km/L
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {distanceCostTable(price).map(({ distance, costs }) => (
                <tr key={distance} className="border-b border-line last:border-b-0">
                  <th scope="row" className="whitespace-nowrap px-1.5 py-2.5 text-left font-medium text-ink">
                    {/* 同じページへの遷移で計算機を作り直して距離を反映させるため、next/link ではなく素の <a> を使う */}
                    <a
                      href={distanceLink(distance)}
                      className="inline-flex min-h-8 items-center text-accent underline underline-offset-2 hover:no-underline"
                    >
                      <span className="num">{distance.toLocaleString("ja-JP")}</span>&nbsp;km
                    </a>
                  </th>
                  {costs.map((cost, i) => (
                    <td key={CAR_TYPE_EFFICIENCIES[i].id} className="whitespace-nowrap px-1.5 py-2.5">
                      <span className="num">{cost}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
