"use client";

import { useMemo } from "react";

import { inputClass } from "@/components/settingsUi";
import { applyFillChain, sortForChain } from "@/lib/fillChain";
import type {
  GenericCsvColumnKey,
  GenericCsvMapping,
  GenericCsvTable,
  ParseGenericCsvResult,
} from "@/lib/importers/genericCsv";
import type { DistanceMode, FuelRecord } from "@/lib/types";

export interface GenericCsvMappingFormProps {
  table: GenericCsvTable;
  mapping: GenericCsvMapping;
  onChange: (mapping: GenericCsvMapping) => void;
  /** 割り当てどおりに読んだ結果（ImportPanel が計算して渡す） */
  parsed: ParseGenericCsvResult;
  disabled?: boolean;
}

const FIELDS: readonly { key: GenericCsvColumnKey; label: string; required?: boolean }[] = [
  { key: "date", label: "日付", required: true },
  { key: "fuel", label: "給油量 L", required: true },
  { key: "distance", label: "距離", required: true },
  { key: "totalCost", label: "金額（合計）" },
  { key: "pricePerUnit", label: "単価（円/L）" },
  { key: "isFull", label: "満タン" },
  { key: "station", label: "スタンド名" },
  { key: "memo", label: "メモ" },
];

const DISTANCE_KINDS: readonly { value: DistanceMode; label: string }[] = [
  { value: "trip", label: "区間距離（トリップメーター）" },
  { value: "odometer", label: "積算距離（オドメーター）" },
];

const PREVIEW_ROWS = 5;
const PREVIEW_SKIPS = 3;

const fmt = (n: number | null | undefined, digits = 1) =>
  n == null ? "—" : n.toLocaleString("ja-JP", { maximumFractionDigits: digits });

/** 汎用 CSV の列の割り当て（各項目に CSV の列を選ぶ）と、読み取り結果のプレビュー */
export default function GenericCsvMappingForm({ table, mapping, onChange, parsed, disabled }: GenericCsvMappingFormProps) {
  // 取り込む行だけで連鎖計算した参考の区間距離・燃費（CSV の燃費の列は使わない）
  const previewRows = useMemo(() => {
    if (!parsed.ok) return [];
    const sorted = sortForChain(parsed.records as FuelRecord[]);
    return applyFillChain(sorted, { distance_mode: parsed.distanceKind }).slice(0, PREVIEW_ROWS);
  }, [parsed]);

  const setColumn = (key: GenericCsvColumnKey, value: string) =>
    onChange({ ...mapping, [key]: value === "" ? null : Number(value) });

  return (
    <div className="mb-4 space-y-3">
      <p className="text-xs leading-relaxed text-sub">
        列名が FuelLens と違っても取り込めます。項目ごとに CSV の列を選んでください（列名から推測済み）。燃費の列は使わず、区間距離と給油量から計算します。
      </p>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {FIELDS.map(({ key, label, required }) => (
          <div key={key}>
            <label htmlFor={`generic-csv-${key}`} className="mb-1 block text-xs text-sub">
              {label}
              {required ? <span className="ml-1 text-warn">必須</span> : <span className="ml-1">任意</span>}
            </label>
            <select
              id={`generic-csv-${key}`}
              value={mapping[key] === null ? "" : String(mapping[key])}
              onChange={e => setColumn(key, e.target.value)}
              disabled={disabled}
              className={inputClass}
            >
              <option value="">使わない</option>
              {table.headers.map((h, i) => (
                <option key={i} value={i}>
                  {h}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <fieldset disabled={disabled}>
        <legend className="mb-1 text-xs text-sub">距離の列の意味</legend>
        <div className="flex flex-col gap-1.5 sm:flex-row sm:gap-4">
          {DISTANCE_KINDS.map(({ value, label }) => (
            <label key={value} className="flex min-h-10 items-center gap-2 text-sm text-ink">
              <input
                type="radio"
                name="generic-csv-distance-kind"
                value={value}
                checked={mapping.distanceKind === value}
                onChange={() => onChange({ ...mapping, distanceKind: value })}
                className="h-4 w-4 accent-accent"
              />
              {label}
            </label>
          ))}
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-sub">
          {mapping.distanceKind === "odometer"
            ? "積算距離の差から区間距離を出します。新しく作る車両はオドメーター入力方式になります。"
            : "前回の給油からの区間距離です。新しく作る車両はトリップ入力方式になります。"}
        </p>
      </fieldset>

      {!parsed.ok ? (
        <p role="alert" className="text-xs text-red-400">
          {parsed.error}
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-ink">
            取り込める行 <span className="num font-bold">{parsed.records.length}</span> 件・読み飛ばす行{" "}
            <span className="num font-bold">{parsed.skipped.length}</span> 件
          </p>
          {parsed.skipped.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-4 text-xs text-sub" aria-label="読み飛ばす行">
              {parsed.skipped.slice(0, PREVIEW_SKIPS).map(s => (
                <li key={s.line}>
                  {s.line} 行目: {s.reason}
                </li>
              ))}
              {parsed.skipped.length > PREVIEW_SKIPS && <li>ほか {parsed.skipped.length - PREVIEW_SKIPS} 行</li>}
            </ul>
          )}
          {previewRows.length > 0 && (
            <div className="overflow-x-auto rounded-xl bg-surface-2">
              <table className="w-full border-collapse text-left text-xs">
                <caption className="sr-only">取り込む記録の先頭（日付順）</caption>
                <thead>
                  <tr className="border-b border-line text-sub">
                    <th scope="col" className="px-2 py-2 font-medium">日付</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">
                      {parsed.distanceKind === "odometer" ? "積算 km" : "区間 km"}
                    </th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">給油量 L</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">金額 円</th>
                    <th scope="col" className="px-2 py-2 font-medium">満タン</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">燃費 km/L</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map(r => (
                    <tr key={r.id} className="border-b border-line last:border-b-0">
                      <td className="num whitespace-nowrap px-2 py-1.5">{r.date}</td>
                      <td className="num px-2 py-1.5 text-right">
                        {fmt(parsed.distanceKind === "odometer" ? r.odometer : r.total_distance)}
                      </td>
                      <td className="num px-2 py-1.5 text-right">{fmt(r.fuel_amount, 2)}</td>
                      <td className="num px-2 py-1.5 text-right">{fmt(r.total_cost, 0)}</td>
                      <td className="px-2 py-1.5">{r.is_full === false ? "部分" : "満タン"}</td>
                      <td className="num px-2 py-1.5 text-right">{fmt(r.fuel_efficiency, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-2 py-1.5 text-[11px] text-sub">燃費は取り込む行だけで計算した参考値です。</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
