"use client";

import { Suspense, useRef, useState, useSyncExternalStore } from "react";
import type { RecordInput } from "@/lib/types";
import ScanReviewSheet from "@/components/ScanReviewSheet";
import VehicleSelector from "@/components/VehicleSelector";
import { useToast } from "@/components/Toast";
import { AppPage, HookErrorLine, PageHeader, ReadOnlyCaption } from "@/components/AppShell";
import { Section } from "@/components/ui";
import { useVehicleScope } from "@/lib/useVehicleScope";
import { useResolvedAuth } from "@/lib/data/initialAuthContext";
import { useRecordForm } from "@/lib/useRecordForm";
import { useRecordEditing } from "@/lib/useRecordEditing";
import { useScanPipeline } from "@/lib/scan/useScanPipeline";
import { useScanWaitPromo } from "@/lib/promo/useScanWaitPromo";
import ScanWaitPromoModal from "@/components/ScanWaitPromoModal";
import { useImageDropPaste } from "@/lib/scan/useImageDropPaste";
import { useTrial } from "@/lib/scan/trialContext";
import { scanAccessOf } from "@/lib/trial";
import { useBatchScan } from "@/lib/scan/useBatchScan";
import {
  BATCH_BLOCKED_MESSAGES,
  BATCH_SIGNED_OUT_MESSAGE,
  emptyAnalyzeResult,
  overLimitMessage,
  selectBatchImages,
  trialBatchLimitMessage,
} from "@/lib/scan/batch";
import {
  DISCARD_FORM_CONFIRM_MESSAGE,
  SHARE_UNAVAILABLE_MESSAGE,
  scanMenuAvailabilityOf,
  shortcutReadinessOf,
} from "@/lib/scan/shortcuts";
import { RegisterScanActions } from "@/components/ScanActions";
import { prefillAppliedMessage, prefillToRecord, type ManualPrefill } from "@/lib/manualPrefill";
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
import TrialLoginPrompt from "./_components/TrialLoginPrompt";
import TwoPhotoScanSheet from "./_components/TwoPhotoScanSheet";
import BatchScanCard from "./_components/BatchScanCard";
import TwoImageChoiceDialog from "./_components/TwoImageChoiceDialog";
import AddToHomeScreenCard from "./_components/AddToHomeScreenCard";
import { useAddToHomeScreen } from "@/lib/useAddToHomeScreen";

const subscribeNothing = () => () => {};

/**
 * ホーム画面（デザイン D: 計器盤のヒーロー＋グループリスト。docs/design-system.md）。
 * 状態と処理はフックに、描画は ./_components に分けている（docs/architecture.md「メイン画面の構成」）。
 * - useVehicleScope: 選択中の車両とその記録（連鎖計算済み・日付の降順）
 * - useScanPipeline: 圧縮 → /api/analyze → 確認シート（ScanReviewSheet）。保存は確認シートの「保存」のみ
 *   （未ログインのお試し読み取りも同じ流れで、保存先はこのブラウザ。残り回数は useTrial の表示用の写し）
 * - useImageDropPaste: 画像のドロップ（ページ全体）・ペースト（2 枚以上は processFiles で振り分ける）
 * - TwoPhotoScanSheet: レシートとメーターを別々に撮る（2 枚を 1 回の解析に送る。scan.processImagePair）
 * - useBatchScan: 写真を 3 枚以上選んだとき（アルバム・ドロップ・ペースト）の一括読み取り。1 枚ずつ確認シートを出し、
 *   「保存して次へ / この写真をスキップ / 残りを中止」で進める（BatchScanCard・ScanReviewSheet の batch）。
 *   ちょうど 2 枚のときは TwoImageChoiceDialog で「レシートとメーターの組」か「2 件の一括読み取り」かを選ぶ
 * - useRecordEditing: 手動入力・最新記録の編集（重複確認付きの保存）
 * - RegisterScanActions: スキャンメニュー（AppShell）に撮影・アルバム・2 枚で撮る・手動入力の処理を登録する（メニューがタップの中で直接呼ぶ）
 * - useAddToHomeScreen: 記録があるスマホのブラウザに一度だけ出す「ホーム画面に追加」の案内（AddToHomeScreenCard）
 * - ShortcutActionHandler（Suspense の内側）: `?action=` の PWA ショートカット・他の画面のスキャンメニュー・共有。
 *   撮影・アルバムで来たときは「撮影の準備ができました」の案内（ScanReadyPrompt）も出す（遷移後はファイル選択が開かないことがあるため）
 *
 * レイアウト: スマホは 1 カラム（ヒーロー → 今月 → 最近の記録）。PC（lg 以上）は 2 カラムで、
 * 左にヒーローと今月、右に最近の記録・記録の入口・ドロップ先。
 */
export default function Home() {
  const { toast, confirm } = useToast();
  // 未ログインの AI スキャンはお試し読み取り（lib/trial.ts）が残っているときだけ。無ければ撮影・アルバムを無効にして案内する。
  // サーバーが未ログインと言っていれば Clerk の読み込みを待たずに確定する（lib/data/initialAuth.ts）
  const { isLoaded: authLoaded, isSignedIn } = useResolvedAuth();
  const trial = useTrial();
  // 選択中の車両とその記録。未分類（vehicle_id=null）の記録は既定（先頭）車両を選択中のときだけ含まれる。
  // loading は車両・記録のどちらかの読み込み中（スキャン中は scan.loading）。
  // previewing はログイン中に Clerk の読み込み前のキャッシュを表示している間（表示はするが、書き込み・撮影は読み込み中と同じに扱う）
  const scope = useVehicleScope();
  const { vehicles, selectedVehicleId, selectedVehicle, distanceMode, records, loading: isLoading, readOnly, previewing } = scope;

  const scan = useScanPipeline({ isSignedIn, toast, confirm, onTrialRemaining: trial.setRemaining });
  // お試しを使い切ったときのログインの案内を「閉じる」で消したか（この表示中だけ）
  const [trialPromptDismissed, setTrialPromptDismissed] = useState(false);
  // 写真の一括読み取り（2 枚以上）。最中は 1 枚のスキャンと同じく撮影・アルバム・手動入力を始められない。
  // 未ログインのお試しでは 1 枚ごとに 1 回分を使う（残り回数はサーバーの X-Trial-Remaining で更新する）
  const batch = useBatchScan({ isSignedIn, toast, confirm, onTrialRemaining: trial.setRemaining });
  // 解析待ちの提携先の紹介（PR）。バイクのときだけ、端末ごとに 7 日に 1 回。エラー・キャンセルなら自動で閉じ、結果が出たら閉じるまで出したまま（結果の確認シートは閉じた後に出す）
  const scanPromo = useScanWaitPromo({ loadingStep: scan.loadingStep, vehicleType: selectedVehicle?.type, batchActive: batch.active, resultReady: scan.scanResult !== null });
  // 他の画面・ショートカットから撮影 / アルバムで来たときの案内。画像を選んだ・スキャンが始まった・閉じたら消す
  const [scanPrompt, setScanPrompt] = useState(false);
  const processFile = (file: File) => {
    setScanPrompt(false);
    if (batch.isActive()) return;
    return scan.processImageFile(file);
  };
  // レシートとメーターを別々に撮るシート（key は開くたびに増やし、前回の選択を残さない）。
  // initial は 2 枚の写真で「レシートとメーターの組として読む」を選んだとき（選んだ順に レシート / メーター の候補にする。シートで入れ替えられる）
  const [pairSheet, setPairSheet] = useState<{ key: number; initial?: { receipt: File; meter: File } } | null>(null);
  const pairSheetKey = useRef(0);
  const openPairSheet = (initial?: { receipt: File; meter: File }) => {
    setScanPrompt(false);
    pairSheetKey.current += 1;
    setPairSheet({ key: pairSheetKey.current, initial });
  };

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
  // AI スキャン（撮影・アルバム・ドロップ）の可否と案内。ログイン中は常に使える
  const access = scanAccessOf(signedOut, trial);

  // ちょうど 2 枚の写真が選ばれたときの読み取り方の選択（レシート + メーターの組 / 2 件の一括読み取り）
  const [twoImageChoice, setTwoImageChoice] = useState<readonly [File, File] | null>(null);

  // 複数枚の AI 読み取り（2 枚の組・一括）を今は始められない理由。始められれば null。
  // 未ログインはお試しが残っているときだけ（無効なら従来どおりログインの案内。API は呼ばない）
  const multiScanBlock = (): string | null => {
    if (signedOut && access.locked) return trial.enabled ? (access.note ?? BATCH_SIGNED_OUT_MESSAGE) : BATCH_SIGNED_OUT_MESSAGE;
    if (!mounted || !authLoaded || isLoading || previewing) return BATCH_BLOCKED_MESSAGES.loading;
    if (readOnly) return BATCH_BLOCKED_MESSAGES.readOnly;
    if (scan.isScanning() || batch.isActive()) return BATCH_BLOCKED_MESSAGES.busy;
    if (scan.scanResult) return "確認中の読み取り結果を保存または破棄してから、次の画像を読み込んでください。";
    return null;
  };

  // 一括読み取りを始める（images は 2 枚以上・上限内）。
  // 未ログインのお試しでは 1 枚ごとに 1 回分を使うので、残り回数までに切り詰め、残りはログインを案内する
  const startBatch = (images: readonly File[]) => {
    const block = multiScanBlock();
    if (block) {
      toast(block, { type: "warning" });
      return;
    }
    let targets = images;
    if (signedOut && targets.length > trial.remaining) {
      toast(trialBatchLimitMessage(trial.remaining, targets.length - trial.remaining), { type: "warning" });
      targets = targets.slice(0, trial.remaining);
    }
    if (targets.length === 1) {
      void processFile(targets[0]);
      return;
    }
    scan.clearPreview();
    batch.start(targets);
  };

  // 写真が 2 枚以上選ばれた（アルバム・ドロップ・ペースト）。1 枚なら従来の読み取り、
  // ちょうど 2 枚なら読み取り方を選ぶダイアログ、3 枚以上は一括読み取り。
  // 未ログイン（お試しが無い）・閲覧専用・読み込み中・読み取り中・確認中は始めずに理由を伝える
  const processFiles = (files: File[]) => {
    setScanPrompt(false);
    const { images, nonImages, overLimit } = selectBatchImages(files);
    if (images.length === 0) {
      toast("画像ファイルのみ読み込めます。", { type: "warning" });
      return;
    }
    if (nonImages > 0) toast(`画像以外のファイル ${nonImages} 件は読み込みませんでした`, { type: "warning" });
    if (images.length === 1) {
      void processFile(images[0]);
      return;
    }
    const block = multiScanBlock();
    if (block) {
      toast(block, { type: "warning" });
      return;
    }
    if (images.length === 2) {
      setTwoImageChoice([images[0], images[1]]);
      return;
    }
    if (overLimit > 0) toast(overLimitMessage(overLimit), { type: "warning" });
    startBatch(images);
  };

  const { isDragging, dropZoneProps } = useImageDropPaste({
    onImage: processFile,
    onImages: processFiles,
    isBusy: () => scan.isScanning() || batch.isActive(),
    toast,
  });

  // 撮影・アルバム・手動入力の可否（スキャンメニュー・`?action=` で共通）
  const readiness = shortcutReadinessOf({
    mounted,
    dataLoading: isLoading || previewing,
    scanning: scan.loading || batch.active,
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
  const openPair = () => {
    if (!availability.canScan) return;
    // 未ログインでお試しが無い（無効・使い切った）ときは開かずに案内する（`?action=pair` で来たときなど）
    if (access.locked) {
      if (access.note) toast(access.note, { type: "warning" });
      return;
    }
    openPairSheet();
  };

  // 手動入力を始める。手動入力・編集のフォームを開いていれば、破棄してよいか確認する。
  // prefill は燃費計算ページ（/calc）から `?action=manual&distance=…` で来たときの事前入力（検証済み。lib/manualPrefill.ts）。
  // 選択中の車両の入力方式に合わせて入れる（オドメーターモードでは区間距離を入れない。prefillToRecord）。
  // 保存はしない（利用者が日付・車両を確認して通常どおり保存する）
  const requestManualEntry = async (prefill: ManualPrefill | null = null) => {
    if (!availability.canManual) return;
    if (editing.isEditing) {
      const ok = await confirm(DISCARD_FORM_CONFIRM_MESSAGE, { confirmLabel: "破棄して入力", danger: true });
      if (!ok) return;
    }
    if (prefill) {
      const { record, distanceOmitted } = prefillToRecord(prefill, distanceMode);
      // 燃費計算ページからの引き継ぎは入口を "calc" として記録する（計測用。画面・計算には影響しない）
      editing.startManualEntry(record, { source: "calc" });
      toast(prefillAppliedMessage(selectedVehicle?.name, distanceOmitted), { type: "info" });
    } else {
      editing.startManualEntry();
    }
    setActive(null);
  };

  // 確認シートの「保存」（重複確認でキャンセルならシートは開いたまま。失敗は throw してシートを開いたままにする）
  const handleScanSave = async (record: RecordInput) => {
    try {
      // 記録の入口（計測用）: 2 枚（レシート + メーター）で読み取ったら "pair"、1 枚なら "scan"
      const source = scan.scanResult?.meterImage ? "pair" : "scan";
      const added = await editing.addWithDuplicateCheck({ ...record, source });
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

  // 一括読み取りの確認シートの「保存して次へ」（通常の保存と同じく重複確認付き。キャンセルならシートは開いたまま）
  const handleBatchSave = async (record: RecordInput) => {
    try {
      // 記録の入口（計測用）: 一括読み取りの確認シートから保存したものは "batch"
      const added = await editing.addWithDuplicateCheck({ ...record, source: "batch" });
      if (!added) return;
      setActive({ id: added.id, fromScan: true });
      batch.markSaved();
    } catch (err) {
      console.error(err);
      toast(err instanceof Error ? err.message : "保存に失敗しました", { type: "error" });
      throw err;
    }
  };
  const batchItem = batch.currentItem;
  const batchReviewing = batchItem !== null && (batchItem.status === "ready" || batchItem.status === "failed");

  // 表示するレコード: 直前に保存した記録（一覧に無ければ最新）、無ければ最新
  const displayRecord = (active && records.find(r => r.id === active.id)) || records[0];
  // この画面で保存した直後の記録か（燃費が無くてもヒーローで差し替えない）。scanned はそのうちスキャンで保存したもの
  const justSaved = !!active && active.id === displayRecord?.id;
  const scanned = justSaved && !!active?.fromScan;
  const hasRecords = records.length > 0;
  const showScanPrompt = scanPrompt && availability.canScan && !access.locked;
  // お試しを使い切ったらログインを案内する（確認シートを開いている間は出さない）
  const showTrialPrompt = access.exhausted && !trialPromptDismissed && scan.scanResult === null;
  // 「ホーム画面に追加」の案内（読み込み後・記録あり・スマホのブラウザ・未表示のときだけ）。編集・手動入力の間は出さない
  const a2hs = useAddToHomeScreen(!isLoading && hasRecords);
  const showA2hs = a2hs.visible && !editing.isEditing;

  const entrySection = (
    <Section title="記録する">
      <ScanEntryList
        onCamera={openCamera}
        onAlbum={openAlbum}
        onPair={openPair}
        onManual={() => void requestManualEntry()}
        access={access}
        scanning={scan.loading || batch.active}
        readOnly={readOnly}
        distanceMode={distanceMode}
      />
    </Section>
  );

  return (
    <AppPage>
      <RegisterScanActions
        openCamera={openCamera}
        openAlbum={openAlbum}
        openPair={openPair}
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
          // シートを開くだけなのでタップの扱いは要らない（ファイル選択はシートのボタンで開く）
          onPair={openPair}
          onManual={(prefill) => void requestManualEntry(prefill)}
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
        <ReadOnlyCaption show={readOnly && !previewing} />

        {/* 未ログインでお試し読み取りを使い切ったときのログインの案内 */}
        {showTrialPrompt && (
          <div className="mb-3 lg:mb-6">
            <TrialLoginPrompt onDismiss={() => setTrialPromptDismissed(true)} />
          </div>
        )}

        {/* 他の画面・ショートカットから撮影 / アルバムで来たときの案内（ボタンのタップの中でファイル選択を開く） */}
        {showScanPrompt && (
          <div className="mb-3 lg:mb-6">
            <ScanReadyPrompt onCamera={openCamera} onAlbum={openAlbum} onDismiss={() => setScanPrompt(false)} />
          </div>
        )}

        {/* 写真の一括読み取りの状態カード（確認シートの後ろ。読み取り中・回数制限の待ちの間に見える） */}
        {batch.state && batch.state.phase === "running" && (
          <div className="mb-3 lg:mb-6">
            <BatchScanCard state={batch.state} onSkip={batch.skip} onAbort={() => void batch.requestAbort()} />
          </div>
        )}

        {/* 解析中・プレビューの状態カード（無ければ何も出さない）と、非表示のファイル入力 */}
        <div className={scan.loading || scan.preview ? "mb-3 lg:mb-6" : undefined}>
          <ScanPanel
            ref={scanPanelRef}
            scanning={scan.loading}
            loadingStep={scan.loadingStep}
            preview={scan.preview}
            previewMeter={scan.previewMeter}
            sharedPending={scan.sharedPending}
            readOnly={readOnly}
            onSelectFile={(file) => void processFile(file)}
            onSelectFiles={processFiles}
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
                {showA2hs && a2hs.guide && (
                  <AddToHomeScreenCard guide={a2hs.guide} onInstall={() => void a2hs.install()} onDismiss={a2hs.dismiss} />
                )}
                {hasRecords ? (
                  <MonthSummarySection records={records} vehicleName={selectedVehicle?.name} shareDisabled={previewing} />
                ) : !editing.isManualEntry && entrySection}
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
            <DropZoneRow isDragging={isDragging} onClick={openAlbum} disabled={scan.loading || batch.active} locked={access.locked} />
          </div>
        </div>
      </div>

      {/* レシートとメーターを別々に撮る（2 枚で読み取る）。読み取りを始めたら閉じ、結果は下の確認シートに出す */}
      {pairSheet && (
        <TwoPhotoScanSheet
          key={pairSheet.key}
          distanceMode={distanceMode}
          initialFiles={pairSheet.initial}
          onClose={() => setPairSheet(null)}
          onSubmit={(receipt, meter) => {
            setPairSheet(null);
            void scan.processImagePair(receipt, meter);
          }}
        />
      )}

      {/* ちょうど 2 枚の写真: レシートとメーターの組として読むか、2 件の給油として一括で読むかを選ぶ */}
      {twoImageChoice && (
        <TwoImageChoiceDialog
          onPair={() => {
            const [receipt, meter] = twoImageChoice;
            setTwoImageChoice(null);
            const block = multiScanBlock();
            if (block) {
              toast(block, { type: "warning" });
              return;
            }
            openPairSheet({ receipt, meter });
          }}
          onBatch={() => {
            const files = twoImageChoice;
            setTwoImageChoice(null);
            startBatch(files);
          }}
          onCancel={() => setTwoImageChoice(null)}
        />
      )}

      <ScanWaitPromoModal promo={scanPromo.promo} done={scanPromo.done} onClose={scanPromo.dismiss} onLinkClick={scanPromo.markClicked} />

      {/* スキャン結果の確認シート（保存は「保存」を押したときのみ） */}
      {scan.scanResult && !scanPromo.promo && (
        <ScanReviewSheet
          key={scan.scanResult.key}
          result={scan.scanResult.data}
          imageSrc={scan.scanResult.image}
          meterImageSrc={scan.scanResult.meterImage}
          vehicle={selectedVehicle}
          records={records}
          readOnly={readOnly}
          onSave={handleScanSave}
          onDiscard={scan.discardResult}
        />
      )}

      {/* 一括読み取りの確認シート（1 枚ずつ。読み取れなかった写真は空の結果で開き、写真を見ながら手入力できる） */}
      {batch.state && batchItem && batchReviewing && (
        <ScanReviewSheet
          key={`batch-${batch.runId}-${batchItem.index}`}
          result={batchItem.result ?? emptyAnalyzeResult()}
          imageSrc={batchItem.dataUrl}
          vehicle={selectedVehicle}
          records={records}
          readOnly={readOnly}
          onSave={handleBatchSave}
          onDiscard={batch.skip}
          batch={{
            index: batchItem.index,
            total: batch.state.items.length,
            readError: batchItem.status === "failed" ? batchItem.error : null,
            onAbort: () => void batch.requestAbort(),
          }}
        />
      )}
    </AppPage>
  );
}
