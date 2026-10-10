"use client";

import { Download } from "lucide-react";
import { IconButton, Menu, MenuItem } from "@/components/ui";
import { ALL, MONTH_OPTIONS, SORT_LABELS, type HistorySort } from "@/lib/history/recordList";

export type HistoryToolbarProps = {
  years: readonly string[];
  year: string;
  month: string;
  sort: HistorySort;
  onYearChange: (year: string) => void;
  onMonthChange: (month: string) => void;
  onSortChange: (sort: HistorySort) => void;
  /** 表示中の件数（絞り込み後） */
  count: number;
  onExport: () => void;
  /** 記録が 1 件も無い（絞り込み・並べ替えを無効にする） */
  disabled: boolean;
};

const SORTS: readonly HistorySort[] = ["date", "created_at"];

/**
 * 履歴の操作列: 年・月・並び順のチップメニューと件数、右端に CSV の書き出し。
 * 375px では年・月の後で折り返し、並び順は 2 行目に回る。
 */
export default function HistoryToolbar({
  years,
  year,
  month,
  sort,
  onYearChange,
  onMonthChange,
  onSortChange,
  count,
  onExport,
  disabled,
}: HistoryToolbarProps) {
  const yearLabel = year === ALL ? "すべての年" : `${year}年`;
  const monthLabel = month === ALL ? "すべての月" : `${month}月`;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 lg:mb-6">
      <Menu label="年で絞り込み" trigger={yearLabel} triggerAriaLabel={`年で絞り込み: ${yearLabel}`} disabled={disabled}>
        <MenuItem checked={year === ALL} onSelect={() => onYearChange(ALL)}>
          すべての年
        </MenuItem>
        {years.map(y => (
          <MenuItem key={y} checked={year === y} onSelect={() => onYearChange(y)}>
            <span className="num">{y}</span>年
          </MenuItem>
        ))}
      </Menu>

      <Menu label="月で絞り込み" trigger={monthLabel} triggerAriaLabel={`月で絞り込み: ${monthLabel}`} disabled={disabled}>
        <MenuItem checked={month === ALL} onSelect={() => onMonthChange(ALL)}>
          すべての月
        </MenuItem>
        {MONTH_OPTIONS.map(m => (
          <MenuItem key={m} checked={month === m} onSelect={() => onMonthChange(m)}>
            <span className="num">{m}</span>月
          </MenuItem>
        ))}
      </Menu>

      <Menu
        label="並び順"
        trigger={SORT_LABELS[sort]}
        triggerAriaLabel={`並び順: ${SORT_LABELS[sort]}`}
        disabled={disabled}
      >
        {SORTS.map(s => (
          <MenuItem key={s} checked={sort === s} onSelect={() => onSortChange(s)}>
            {SORT_LABELS[s]}
          </MenuItem>
        ))}
      </Menu>

      <div className="ml-auto flex shrink-0 items-center gap-3">
        <span role="status" className="text-[13px] text-sub">
          <span className="num">{count}</span>件
        </span>
        <IconButton
          aria-label="CSVで書き出す"
          title={count > 0 ? "表示中の記録をCSV形式でダウンロード" : "書き出せる記録がありません"}
          disabled={count === 0}
          onClick={onExport}
        >
          <Download className="h-[18px] w-[18px]" aria-hidden="true" />
        </IconButton>
      </div>
    </div>
  );
}

/** 読み込み中の操作列（チップの形だけ） */
export function HistoryToolbarSkeleton() {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 lg:mb-6" aria-hidden="true">
      <div className="h-10 w-28 animate-pulse rounded-xl bg-surface" />
      <div className="h-10 w-28 animate-pulse rounded-xl bg-surface" />
      <div className="h-10 w-40 animate-pulse rounded-xl bg-surface" />
      <div className="ml-auto h-10 w-10 animate-pulse rounded-full bg-surface" />
    </div>
  );
}
