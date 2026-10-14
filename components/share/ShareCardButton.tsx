"use client";

import { useMemo, useState } from "react";
import { Share2 } from "lucide-react";
import { parseLocalDate } from "@/lib/dates";
import { useTodayKey } from "@/lib/home/useCurrentMonthKey";
import { shareButtonLabelOf, shareCardModelOf } from "@/lib/share/card";
import type { FuelRecord } from "@/lib/types";
import ShareCardModal from "./ShareCardModal";

export type ShareCardButtonProps = {
  /** 選択中の車両の記録（連鎖計算済み。useVehicleScope の records） */
  records: ReadonlyArray<FuelRecord>;
  /** 選択中の車両の名前（画像に出す） */
  vehicleName?: string | null;
  /** 本当のデータがそろうまで（previewing など）押せなくする */
  disabled?: boolean;
  className?: string;
};

/**
 * 「今月の燃費をシェア」のボタンとシェアカードのモーダル。
 * 今月（無ければ直近 30 日）に燃費が出ていなければ何も描画しない（lib/share/card.ts の shareCardModelOf）。
 */
export default function ShareCardButton({ records, vehicleName, disabled = false, className = "" }: ShareCardButtonProps) {
  // 今日（画面に戻ってきたときにも読み直す。開いたまま日付・月をまたいでも期間が切り替わる）
  const todayKey = useTodayKey();
  const model = useMemo(() => {
    const today = parseLocalDate(todayKey);
    return today ? shareCardModelOf(records, today, vehicleName) : null;
  }, [records, todayKey, vehicleName]);
  const [open, setOpen] = useState(false);

  if (!model) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className={`-my-2 inline-flex min-h-10 items-center gap-1 rounded-full px-2 text-[13px] font-medium text-accent transition-colors hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${className}`}
      >
        <Share2 className="h-4 w-4" aria-hidden="true" />
        {shareButtonLabelOf(model)}
      </button>
      {open && <ShareCardModal model={model} onClose={() => setOpen(false)} />}
    </>
  );
}
