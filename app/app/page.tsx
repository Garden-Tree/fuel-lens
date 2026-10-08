"use client";

import { Suspense, useRef, useState, useSyncExternalStore } from "react";
import { useAuth } from "@clerk/nextjs";
import { Fuel } from "lucide-react";
import type { RecordInput } from "@/lib/types";
import ScanReviewSheet from "@/components/ScanReviewSheet";
import VehicleSelector from "@/components/VehicleSelector";
import { useToast } from "@/components/Toast";
import { HOME_HEADER_LINKS, HookErrorLine, PageHeader, ReadOnlyCaption } from "@/components/AppShell";
import { useVehicleScope } from "@/lib/useVehicleScope";
import { useRecordForm } from "@/lib/useRecordForm";
import { useRecordEditing } from "@/lib/useRecordEditing";
import { useScanPipeline } from "@/lib/scan/useScanPipeline";
import { useImageDropPaste } from "@/lib/scan/useImageDropPaste";
import { SHARE_UNAVAILABLE_MESSAGE, shortcutReadinessOf } from "@/lib/scan/shortcuts";
import ScanPanel, { type ScanPanelHandle } from "./_components/ScanPanel";
import LatestRecordCard from "./_components/LatestRecordCard";
import ManualEntryCard from "./_components/ManualEntryCard";
import RecordCardSkeleton from "./_components/RecordCardSkeleton";
import HistoryLinkCard from "./_components/HistoryLinkCard";
import ShortcutActionHandler from "./_components/ShortcutActionHandler";

const subscribeNothing = () => () => {};

/**
 * メイン画面。状態と処理はフックに、描画は ./_components に分けている（docs/architecture.md「メイン画面の構成」）。
 * - useVehicleScope: 選択中の車両とその記録
 * - useScanPipeline: 圧縮 → /api/analyze → 確認シート（ScanReviewSheet）。保存は確認シートの「保存」のみ
 * - useImageDropPaste: 画像のドロップ・ペースト
 * - useRecordEditing: 手動入力・最新記録の編集（重複確認付きの保存）
 * - ShortcutActionHandler（Suspense の内側）: `?action=` の PWA ショートカット・共有
 */
export default function Home() {
  const { toast, confirm } = useToast();
  // AIスキャンはログイン必須（/api/analyze が 401 を返す）。未ログイン時のヒント表示に使う
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  // 選択中の車両とその記録。未分類（vehicle_id=null）の記録は既定（先頭）車両を選択中のときだけ含まれる。
  // loading は車両・記録のどちらかの読み込み中（スキャン中は scan.loading）
  const scope = useVehicleScope();
  const { vehicles, selectedVehicleId, selectedVehicle, distanceMode, records, loading: isLoading, readOnly } = scope;

  const scan = useScanPipeline({ isSignedIn, toast, confirm });
  const { isDragging, dropZoneProps } = useImageDropPaste({
    onImage: (file) => scan.processImageFile(file),
    isBusy: scan.isScanning,
    toast,
  });

  // スキャン・手動入力の直後に保存した記録を優先表示する（fromScan: 見出しを「Scanned Result」にする）
  const [active, setActive] = useState<{ id: string; fromScan: boolean } | null>(null);

  // 右カラムのフォーム（手動入力 / 最新記録の編集）。車両・距離の入力方式を切り替えたら閉じる
  const form = useRecordForm();
  const editing = useRecordEditing({
    scope,
    form,
    toast,
    confirm,
    onAdded: (record) => setActive({ id: record.id, fromScan: false }),
  });

  const scanPanelRef = useRef<ScanPanelHandle>(null);

  // ハイドレーション後に true（車両名などブラウザにしかない値は、それまで出さない）
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false);

  const startManualEntry = () => {
    editing.startManualEntry();
    setActive(null);
  };

  // 確認シートの「保存」（重複確認でキャンセルならシートは開いたまま。失敗は throw してシートを開いたままにする）
  const handleScanSave = async (record: RecordInput) => {
    try {
      const added = await editing.addWithDuplicateCheck(record);
      if (!added) return;
      setActive({ id: added.id, fromScan: true });
      scan.discardResult();
      toast("給油記録を保存しました", { type: "success" });
    } catch (err) {
      console.error(err);
      toast(err instanceof Error ? err.message : "保存に失敗しました", { type: "error" });
      throw err;
    }
  };

  // 表示するレコード: 直前に保存した記録（一覧に無ければ最新）、無ければ最新
  const displayRecord = (active && records.find(r => r.id === active.id)) || records[0];
  const scanned = !!active?.fromScan && active.id === displayRecord?.id;

  const currentVehicleName = mounted ? vehicles.find(v => v.id === selectedVehicleId)?.name || "車両" : "車両";

  const readiness = shortcutReadinessOf({
    mounted,
    dataLoading: isLoading,
    scanning: scan.loading,
    reviewing: scan.scanResult !== null,
    readOnly,
    authLoaded,
  });

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white p-4 md:p-8 pb-32 font-sans flex flex-col items-center">
      <Suspense fallback={null}>
        <ShortcutActionHandler
          readiness={readiness}
          onScan={() => scanPanelRef.current?.openCamera()}
          onManual={startManualEntry}
          onShared={(token) => void scan.processSharedImage(token)}
          onShareUnavailable={() => toast(SHARE_UNAVAILABLE_MESSAGE, { type: "warning" })}
        />
      </Suspense>
      <div className="w-full max-w-5xl">
        <PageHeader title="FuelLens" icon={Fuel} links={HOME_HEADER_LINKS} />

        {/* データ取得エラー / 閲覧専用の表示 */}
        <HookErrorLine error={scope.error} />
        <ReadOnlyCaption show={readOnly} />

        {/* 車両切り替えセレクタータブ（車両の読み込み中はスケルトン） */}
        <VehicleSelector
          loading={scope.vehiclesLoading}
          vehicles={vehicles}
          selectedVehicleId={selectedVehicleId}
          onSelect={scope.setSelectedVehicleId}
          onAddVehicle={scope.vehicleActions.addVehicle}
          onDeleteVehicle={scope.vehicleActions.deleteVehicle}
          onUpdateVehicle={scope.vehicleActions.updateVehicle}
          readOnly={readOnly}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start w-full">
          <div className="flex flex-col gap-6 w-full">
            <ScanPanel
              ref={scanPanelRef}
              dataLoading={isLoading}
              scanning={scan.loading}
              loadingStep={scan.loadingStep}
              preview={scan.preview}
              sharedPending={scan.sharedPending}
              vehicleName={currentVehicleName}
              distanceMode={distanceMode}
              readOnly={readOnly}
              showSignInHint={mounted && authLoaded && !isSignedIn}
              isDragging={isDragging}
              dropZoneProps={dropZoneProps}
              onSelectFile={(file) => void scan.processImageFile(file)}
              onClearPreview={scan.clearPreview}
              onAnalyzeShared={scan.startSharedAnalysis}
              onManualEntry={startManualEntry}
            />
          </div>

          {/* 右カラム (最新リザルト + 履歴ボタン) */}
          <div className="flex flex-col gap-6 w-full">
            {isLoading ? (
              <RecordCardSkeleton />
            ) : editing.isManualEntry ? (
              <ManualEntryCard
                form={form}
                saving={editing.saving}
                readOnly={readOnly}
                onCancel={editing.cancel}
                onSave={editing.save}
              />
            ) : (
              <LatestRecordCard
                record={displayRecord}
                scanned={scanned}
                distanceMode={distanceMode}
                readOnly={readOnly}
                isEditing={editing.isEditing}
                form={form}
                saving={editing.saving}
                onEdit={editing.startEditing}
                onCancel={editing.cancel}
                onSave={editing.save}
              />
            )}

            <HistoryLinkCard vehicleName={currentVehicleName} />
          </div>
        </div>
      </div>

      {/* スキャン結果の確認シート（保存は「保存」を押したときのみ） */}
      {scan.scanResult && (
        <ScanReviewSheet
          key={scan.scanResult.key}
          result={scan.scanResult.data}
          imageSrc={scan.scanResult.image}
          vehicle={selectedVehicle}
          records={records}
          readOnly={readOnly}
          onSave={handleScanSave}
          onDiscard={scan.discardResult}
        />
      )}
    </main>
  );
}
