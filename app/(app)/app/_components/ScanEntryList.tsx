"use client";

import type { LucideIcon } from "lucide-react";
import { Camera, Edit2, Image as ImageIcon } from "lucide-react";
import { GroupedList, ListRow } from "@/components/ui";
import { SIGNED_OUT_SCAN_NOTE } from "@/components/ScanActionMenu";
import type { DistanceMode } from "@/lib/types";

export type ScanEntryListProps = {
  onCamera: () => void;
  onAlbum: () => void;
  onManual: () => void;
  /** 未ログイン（AI スキャンは使えない。撮影・アルバムを無効にして案内を出す） */
  signedOut: boolean;
  /** スキャン中（すべて押せない） */
  scanning: boolean;
  /** 閲覧専用（手動入力を押せない） */
  readOnly: boolean;
  distanceMode: DistanceMode;
};

function EntryIcon({ icon: Icon, disabled }: { icon: LucideIcon; disabled: boolean }) {
  return (
    <span
      className={`flex h-9 w-9 items-center justify-center rounded-xl ${
        disabled ? "bg-surface-2 text-faint" : "bg-accent-strong text-accent"
      }`}
    >
      <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
    </span>
  );
}

/**
 * 記録の入口（撮影する / アルバムから選ぶ / 手動で入力）。スキャンメニュー（components/ScanActionMenu.tsx）と同じ 3 項目を
 * ホームのグループリストに並べる（記録が無いときの案内と、PC の右カラム）。
 * ボタンから直接ファイル入力を開く（ユーザー操作のうちに開くので、ブラウザにブロックされない）。
 */
export default function ScanEntryList({
  onCamera,
  onAlbum,
  onManual,
  signedOut,
  scanning,
  readOnly,
  distanceMode,
}: ScanEntryListProps) {
  const scanDisabled = signedOut || scanning;
  const manualDisabled = scanning || readOnly;
  return (
    <div className="flex flex-col gap-2">
      <GroupedList>
        <ListRow
          onClick={onCamera}
          disabled={scanDisabled}
          leading={<EntryIcon icon={Camera} disabled={scanDisabled} />}
          title="撮影する"
          subtitle="レシートとメーターを1枚に収めて撮影"
          showChevron={!scanDisabled}
        />
        <ListRow
          onClick={onAlbum}
          disabled={scanDisabled}
          leading={<EntryIcon icon={ImageIcon} disabled={scanDisabled} />}
          title="アルバムから選ぶ"
          subtitle="撮影済みの写真を読み取る"
          showChevron={!scanDisabled}
        />
        <ListRow
          onClick={onManual}
          disabled={manualDisabled}
          leading={<EntryIcon icon={Edit2} disabled={manualDisabled} />}
          title="手動で入力"
          subtitle="金額・給油量・距離を入力"
          showChevron={!manualDisabled}
        />
      </GroupedList>
      <div className="flex flex-col gap-1 px-4 text-xs leading-relaxed">
        {signedOut && <p className="text-warn">{SIGNED_OUT_SCAN_NOTE}</p>}
        <p className="text-sub">
          {distanceMode === "odometer"
            ? "メーターはオドメーター（積算距離）が写るように撮影してください"
            : "メーターはトリップメーター（前回給油からの区間距離）が写るように撮影してください"}
        </p>
      </div>
    </div>
  );
}
