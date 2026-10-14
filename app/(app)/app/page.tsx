"use client";

import { Suspense, useRef, useState, useSyncExternalStore } from "react";
import { useAuth } from "@clerk/nextjs";
import type { RecordInput } from "@/lib/types";
import ScanReviewSheet from "@/components/ScanReviewSheet";
import VehicleSelector from "@/components/VehicleSelector";
import { useToast } from "@/components/Toast";
import { AppFrame, HookErrorLine, PageHeader, ReadOnlyCaption } from "@/components/AppShell";
import { Section } from "@/components/ui";
import { useVehicleScope } from "@/lib/useVehicleScope";
import { useRecordForm } from "@/lib/useRecordForm";
import { useRecordEditing } from "@/lib/useRecordEditing";
import { useScanPipeline } from "@/lib/scan/useScanPipeline";
import { useImageDropPaste } from "@/lib/scan/useImageDropPaste";
import {
  DISCARD_FORM_CONFIRM_MESSAGE,
  SHARE_UNAVAILABLE_MESSAGE,
  scanMenuAvailabilityOf,
  shortcutReadinessOf,
} from "@/lib/scan/shortcuts";
import { RegisterScanActions } from "@/components/ScanActions";
import ScanPanel, { type ScanPanelHandle } from "./_components/ScanPanel";
import LatestRecordCard from "./_components/LatestRecordCard";
import ManualEntryCard from "./_components/ManualEntryCard";
import RecordCardSkeleton, { RecentRecordsSkeleton } from "./_components/RecordCardSkeleton";
import ShortcutActionHandler from "./_components/ShortcutActionHandler";
import MonthSummarySection from "./_components/MonthSummarySection";
import RecentRecordsSection from "./_components/RecentRecordsSection";
import ScanEntryList from "./_components/ScanEntryList";
import WelcomeCard from "./_components/WelcomeCard";
import DropZoneRow from "./_components/DropZoneRow";
import ScanReadyPrompt from "./_components/ScanReadyPrompt";

const subscribeNothing = () => () => {};

/**
 * ホーム画面（デザイン D: 計器盤のヒーロー＋グループリスト。docs/design-system.md）。
 * 状態と処理はフックに、描画は ./_components に分けている（docs/architecture.md「メイン画面の構成」）。
 * - useVehicleScope: 選択中の車両とその記録（連鎖計算済み・日付の降順）
 * - useScanPipeline: 圧縮 → /api/analyze → 確認シート（ScanReviewSheet）。保存は確認シートの「保存」のみ
 * - useImageDropPaste: 画像のドロップ（ページ全体）・ペースト
 * - useRecordEditing: 手動入力・最新記録の編集（重複確認付きの保存）
 * - RegisterScanActions: スキャンメニュー（AppFrame）に撮影・アルバム・手動入力の処理を登録する（メニューがタップの中で直接呼ぶ）
 * - ShortcutActionHandler（Suspense の内側）: `?action=` の PWA ショートカット・他の画面のスキャンメニュー・共有。
 *   撮影・アルバムで来たときは「撮影の準備ができました」の案内（ScanReadyPrompt）も出す（遷移後はファイル選択が開かないことがあるため）
 *
 * レイアウト: スマホは 1 カラム（ヒーロー → 今月 → 最近の記録）。PC（lg 以上）は 2 カラムで、
 * 左にヒーローと今月、右に最近の記録・記録の入口・ドロップ先。
 */
export default function Home() {
  const { toast, confirm } = useToast();
  // AIスキャンはログイン必須（/api/analyze が 401 を返す）。未ログイン時は撮影・アルバムを無効にして案内する
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  // 選択中の車両とその記録。未分類（vehicle_id=null）の記録は既定（先頭）車両を選択中のときだけ含まれる。
  // loading は車両・記録のどちらかの読み込み中（スキャン中は scan.loading）
  const scope = useVehicleScope();
  const { vehicles, selectedVehicleId, selectedVehicle, distanceMode, records, loading: isLoading, readOnly } = scope;

  const scan = useScanPipeline({ isSignedIn, toast, confirm });
  // 他の画面・ショートカットから撮影 / アルバムで来たときの案内。画像を選んだ・スキャンが始まった・閉じたら消す
  const [scanPrompt, setScanPrompt] = useState(false);
  const processFile = (file: File) => {
    setScanPrompt(false);
    return scan.processImageFile(file);
  };
  const { isDragging, dropZoneProps } = useImageDropPaste({
    onImage: processFile,
    isBusy: scan.isScanning,
    toast,
  });

  // スキャン・手動入力の直後に保存した記録を優先表示する（fromScan: 見出しを「スキャンした記録」にする）
  const [active, setActive] = useState<{ id: string; fromScan: boolean } | null>(null);

  // フォーム（手動入力 / 最新記録の編集）。車両・距離の入力方式を切り替えたら閉じる
  const form = useRecordForm();
  const editing = useRecordEditing({
    scope,
    form,
    toast,
    confirm,
    onAdded: (record) => setActive({ id: record.id, fromScan: false }),
  });

  // ハイドレーション後に true（ログイン状態などブラウザにしかない値は、それまで出さない）
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const signedOut = mounted && authLoaded && !isSignedIn;

  // 撮影・アルバム・手動入力の可否（スキャンメニュー・`?action=` で共通）
  const readiness = shortcutReadinessOf({
    mounted,
    dataLoading: isLoading,
    scanning: scan.loading,
    reviewing: scan.scanResult !== null,
    readOnly,
    authLoaded,
  });
  const availability = scanMenuAvailabilityOf(readiness);

  // ファイル入力の click はタップの中で同期的に呼ぶこと（遅れるとブラウザに無視される）
  const scanPanelRef = useRef<ScanPanelHandle>(null);
  const openCamera = () => {
    if (availability.canScan) scanPanelRef.current?.openCamera();
  };
  const openAlbum = () => {
    if (availability.canScan) scanPanelRef.current?.openAlbum();
  };

  const startManualEntry = () => {
    editing.startManualEntry();
    setActive(null);
  };

  // 手動入力を始める。手動入力・編集のフォームを開いていれば、破棄してよいか確認する
  const requestManualEntry = async () => {
    if (!availability.canManual) return;
    if (editing.isEditing) {
      const ok = await confirm(DISCARD_FORM_CONFIRM_MESSAGE, { confirmLabel: "破棄して入力", danger: true });
      if (!ok) return;
    }
    startManualEntry();
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
  // この画面で保存した直後の記録か（燃費が無くてもヒーローで差し替えない）。scanned はそのうちスキャンで保存したもの
  const justSaved = !!active && active.id === displayRecord?.id;
  const scanned = justSaved && !!active?.fromScan;
  const hasRecords = records.length > 0;
  const showScanPrompt = scanPrompt && availability.canScan;

  const entrySection = (
    <Section title="記録する">
      <ScanEntryList
        onCamera={openCamera}
        onAlbum={openAlbum}
        onManual={() => void requestManualEntry()}
        signedOut={signedOut}
        scanning={scan.loading}
        readOnly={readOnly}
        distanceMode={distanceMode}
      />
    </Section>
  );

  return (
    <AppFrame>
      <RegisterScanActions
        openCamera={openCamera}
        openAlbum={openAlbum}
        openManual={() => void requestManualEntry()}
        canScan={availability.canScan}
        canManual={availability.canManual}
        disabledReason={availability.disabledReason}
      />
      <Suspense fallback={null}>
        <ShortcutActionHandler
          readiness={readiness}
          onScan={() => {
            // 遷移してきた場合はタップの扱いが切れていて開かないことがあるので、案内のカードも出す
            openCamera();
            setScanPrompt(true);
          }}
          onAlbum={() => {
            openAlbum();
            setScanPrompt(true);
          }}
          onManual={() => void requestManualEntry()}
          onShared={(token) => {
            setScanPrompt(false);
            void scan.processSharedImage(token);
          }}
          onShareUnavailable={() => toast(SHARE_UNAVAILABLE_MESSAGE, { type: "warning" })}
          onBlocked={(message) => toast(message, { type: "warning" })}
        />
      </Suspense>

      {/* 画像のドロップはページ全体で受け付ける（PC の右カラムに案内の行を出す） */}
      <div {...dropZoneProps} className="relative w-full">
        {isDragging && (
          <div className="pointer-events-none absolute -inset-2 z-40 flex items-center justify-center rounded-hero border-2 border-dashed border-accent bg-ground/80">
            <p className="rounded-xl bg-surface px-4 py-3 text-sm font-bold text-ink">ここに画像をドロップして解析</p>
          </div>
        )}

        {/* ヘッダー（スマホはロゴ、PC は「ホーム」）と車両チップ（車両の読み込み中はスケルトン） */}
        <PageHeader
          title="ホーム"
          brand
          rightSlot={
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
          }
        />

        {/* データ取得エラー / 閲覧専用の表示 */}
        <HookErrorLine error={scope.error} />
        <ReadOnlyCaption show={readOnly} />

        {/* 他の画面・ショートカットから撮影 / アルバムで来たときの案内（ボタンのタップの中でファイル選択を開く） */}
        {showScanPrompt && (
          <div className="mb-3 lg:mb-6">
            <ScanReadyPrompt onCamera={openCamera} onAlbum={openAlbum} onDismiss={() => setScanPrompt(false)} />
          </div>
        )}

        {/* 解析中・プレビューの状態カード（無ければ何も出さない）と、非表示のファイル入力 */}
        <div className={scan.loading || scan.preview ? "mb-3 lg:mb-6" : undefined}>
          <ScanPanel
            ref={scanPanelRef}
            scanning={scan.loading}
            loadingStep={scan.loadingStep}
            preview={scan.preview}
            sharedPending={scan.sharedPending}
            readOnly={readOnly}
            onSelectFile={(file) => void processFile(file)}
            onClearPreview={scan.clearPreview}
            onAnalyzeShared={scan.startSharedAnalysis}
            onManualEntry={() => void requestManualEntry()}
            onCancelScan={scan.abort}
          />
        </div>

        <div className="grid w-full grid-cols-1 items-start gap-3 lg:grid-cols-2 lg:gap-6">
          {/* 左カラム: ヒーロー（前回の燃費 / 編集 / 手動入力 / 記録なしの案内）と今月 */}
          <div className="flex min-w-0 flex-col gap-3 lg:gap-6">
            {isLoading ? (
              <RecordCardSkeleton />
            ) : (
              <>
                {editing.isManualEntry ? (
                  <ManualEntryCard
                    form={form}
                    saving={editing.saving}
                    readOnly={readOnly}
                    onCancel={editing.cancel}
                    onSave={editing.save}
                  />
                ) : displayRecord ? (
                  <LatestRecordCard
                    record={displayRecord}
                    records={records}
                    scanned={scanned}
                    justSaved={justSaved}
                    readOnly={readOnly}
                    isEditing={editing.isEditing}
                    form={form}
                    saving={editing.saving}
                    onEdit={editing.startEditing}
                    onCancel={editing.cancel}
                    onSave={editing.save}
                  />
                ) : (
                  <WelcomeCard distanceMode={distanceMode} />
                )}
                {hasRecords ? <MonthSummarySection records={records} /> : !editing.isManualEntry && entrySection}
              </>
            )}
          </div>

          {/* 右カラム: 最近の記録、（PC のみ）記録の入口とドロップ先 */}
          <div className="flex min-w-0 flex-col gap-3 lg:gap-6">
            {isLoading ? (
              <RecentRecordsSkeleton />
            ) : (
              hasRecords && (
                <>
                  <RecentRecordsSection records={records} />
                  <div className="hidden lg:block">{entrySection}</div>
                </>
              )
            )}
            <DropZoneRow isDragging={isDragging} onClick={openAlbum} disabled={scan.loading} signedOut={signedOut} />
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
    </AppFrame>
  );
}
