"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { Camera, ChevronRight, NotebookPen } from "lucide-react";
import { CalculatorField, ResetButton, ResultItem } from "@/components/ui";
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
 * ただのリンクなので、このページはアプリのコード・Clerk・Supabase を読み込まない）。
 * 燃費が出たら「次回からは写真 1 枚で自動記録」の案内も出す（結果が出る前は出さない）。
 * trialNote は未ログインのお試し読み取りの一文（aiAvailabilityCopy の heroCheck。お試しが無効なら null で出さない）
 */
export default function FuelCalculator({ trialNote = null }: { trialNote?: string | null }) {
  const [input, setInput] = useState<CalcInput>(EMPTY);
  const baseId = useId();
  const result = computeCalc(input);
  const recordHref = calcRecordHref(input);
  const isEmpty = input.distance === "" && input.amount === "" && input.cost === "";

  return (
    <div className="rounded-hero border border-line bg-surface p-4 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {FIELDS.map(({ field, label, unit, placeholder, hint }) => (
          <CalculatorField
            key={field}
            id={`${baseId}-${field}`}
            label={label}
            unit={unit}
            unitSpace="sm"
            placeholder={placeholder}
            hint={hint}
            value={input[field]}
            onChange={(value) => setInput((prev) => ({ ...prev, [field]: value }))}
            error={result.errors[field]}
          />
        ))}
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

      {result.efficiency != null && (
        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-line bg-ground p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <Camera className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-ink">次回からは写真 1 枚で自動記録</p>
              <p className="mt-0.5 text-xs leading-relaxed text-sub">
                レシートとトリップメーターを撮るだけで、AI が読み取って満タン法で燃費を記録します。
                {trialNote && <>{trialNote}。</>}
              </p>
            </div>
          </div>
          <Link
            href="/app"
            data-ga-cta="calc_next"
            className="inline-flex h-11 shrink-0 items-center justify-center gap-1 rounded-xl bg-accent px-4 text-sm font-bold text-ground transition-colors hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            アプリを使う（無料）
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs text-sub">入力した値は保存されません。</p>
        <ResetButton onClick={() => setInput(EMPTY)} disabled={isEmpty} />
      </div>
    </div>
  );
}
