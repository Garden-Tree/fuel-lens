"use client";

import { useState, useRef, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import {
  Camera,
  History,
  Loader2,
  Fuel,
  Image as ImageIcon,
  MapPin,
  Calendar,
  Edit2,
  X,
  Calculator,
  ChevronRight
} from "lucide-react";
import imageCompression from "browser-image-compression";
import type { FuelRecord, RecordInput } from "@/lib/types";
import EditFuelRecordForm from "@/components/EditFuelRecordForm";
import ScanReviewSheet from "@/components/ScanReviewSheet";
import { useVehicleScope } from "@/lib/useVehicleScope";
import VehicleSelector from "@/components/VehicleSelector";
import { useToast } from "@/components/Toast";
import { HOME_HEADER_LINKS, HookErrorLine, PageHeader, ReadOnlyCaption } from "@/components/AppShell";
import { useRecordForm, findDuplicateRecord } from "@/lib/useRecordForm";
import { todayLocalISO } from "@/lib/dates";
import { openRunBefore, previousOdometer } from "@/lib/fillChain";
import RecordBadges, { efficiencyNullReason, formatOdometer } from "@/components/RecordBadges";
import type { AnalyzeErrorResponse, AnalyzeSuccessResponse } from "@/lib/analyze";
import { takeSharedImage } from "@/lib/shareInbox";

/** /api/analyze 呼び出しのクライアント側タイムアウト（サーバー側は Gemini 30秒 + 関数全体 60秒） */
const ANALYZE_TIMEOUT_MS = 45_000;

const DUPLICATE_CONFIRM_MESSAGE = "同じ日付・給油量・金額の記録が既にあります。重複して保存しますか？";

/**
 * PWA ショートカット（manifest の `/app?action=scan` / `/app?action=manual`）と
 * Web Share Target（Service Worker からの `/app?action=shared&t=<token>`、
 * SW 未準備時・画像なしの `/app?action=share-unavailable`）を処理する。
 * useSearchParams を使うため、呼び出し側で <Suspense> で囲み /app の静的プリレンダーを保つ。
 * アクションは 1 ページロードにつき最大 1 回だけ実行し、実行後に `action` / `t` パラメータを URL から消す
 * （`router.replace("/app")` でクエリごと置き換える）。
 */
function ShortcutActionHandler({
  scanReady,
  manualReady,
  sharedReady,
  noticeReady,
  onScan,
  onManual,
  onShared,
  onShareUnavailable,
}: {
  scanReady: boolean;
  manualReady: boolean;
  sharedReady: boolean;
  noticeReady: boolean;
  onScan: () => void;
  onManual: () => void;
  onShared: (token: string | null) => void;
  onShareUnavailable: () => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const action = searchParams.get("action");
  // SW が付けるワンタイムトークン。IndexedDB の保留画像と一致したときだけ取り出す
  const shareToken = searchParams.get("t");
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    if (action === "scan") {
      if (!scanReady) return;
      handled.current = true;
      onScan();
    } else if (action === "manual") {
      if (!manualReady) return;
      handled.current = true;
      onManual();
    } else if (action === "shared") {
      if (!sharedReady) return;
      handled.current = true;
      onShared(shareToken);
    } else if (action === "share-unavailable") {
      if (!noticeReady) return;
      handled.current = true;
      onShareUnavailable();
    } else {
      return;
    }
    router.replace("/app");
  }, [
    action,
    shareToken,
    scanReady,
    manualReady,
    sharedReady,
    noticeReady,
    onScan,
    onManual,
    onShared,
    onShareUnavailable,
    router,
  ]);

  return null;
}

export default function Home() {
  const { toast, confirm } = useToast();
  // paste リスナーは一度しか登録しないため、最新の toast を ref 経由で参照する
  const toastRef = useRef(toast);
  // AIスキャンはログイン必須（/api/analyze が 401 を返す）。未ログイン時のヒント表示に使う
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  // 選択中の車両とその記録（useVehicles + useFuelRecords）。
  // 未分類（vehicle_id=null）の記録は既定（先頭）車両を選択中のときだけ含まれる。
  // isLoading は車両・記録のどちらかの読み込み中（`loading` はスキャン中を表すローカル state）
  const {
    vehicles,
    selectedVehicleId,
    setSelectedVehicleId,
    selectedVehicle,
    distanceMode,
    records,
    vehiclesLoading,
    loading: isLoading,
    error: hookError,
    readOnly,
    scopeKey,
    vehicleActions,
    recordActions: { addRecord, updateRecord },
    getPreviousOdometer,
    getOpenRun,
  } = useVehicleScope();

  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<"compress" | "analyze" | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  // 共有（Web Share Target）で受け取り、まだ解析していない画像（圧縮済み data URL）。
  // 共有は他サイトからの POST でも起こせるため、自動では解析せずユーザーの確認を待つ。
  // state は表示用、ref は確認ダイアログ後の判定用（await 中に別の画像へ切り替わっていないか）
  const [sharedPending, setSharedPendingState] = useState<string | null>(null);
  const sharedPendingRef = useRef<string | null>(null);
  const setSharedPending = useCallback((value: string | null) => {
    sharedPendingRef.current = value;
    setSharedPendingState(value);
  }, []);

  // スキャン結果の確認待ち（確認シートに表示中）。保存は「保存」ボタンを押したときのみ
  const [scanResult, setScanResult] = useState<{ data: AnalyzeSuccessResponse; image: string; key: number } | null>(null);
  const scanKey = useRef(0);

  // スキャン直後のレコードIDを保持し、優先表示するためのステート
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);
  // activeRecordId がスキャン由来か（手動入力の保存直後は "Scanned Result" と表示しない）
  const [activeFromScan, setActiveFromScan] = useState(false);

  // 右カラムのフォーム状態（手動入力 / 最新記録の編集）
  const [isEditing, setIsEditing] = useState(false);
  const [isManualEntry, setIsManualEntry] = useState(false);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const form = useRecordForm();

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraButtonRef = useRef<HTMLButtonElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  // スキャン（圧縮→解析）が進行中かどうか。state の `loading` は再レンダー待ちで
  // 一瞬古い値を返しうるため、同期的な再入防止には ref を使う
  const scanInFlight = useRef(false);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  // クリップボードからのペースト対応
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      // 入力フォーム等にフォーカスがある場合は無視する
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      const file = e.clipboardData?.files?.[0];
      if (!file) return;

      // スキャン中の再入は無視する
      if (scanInFlight.current) return;

      if (!file.type.startsWith("image/")) {
        toastRef.current("画像ファイルのみペースト可能です。", { type: "warning" });
        return;
      }

      e.preventDefault();
      await processImageFileRef.current(file);
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  /**
   * 画像を圧縮してプレビューに出し、解析する。
   * `confirmBeforeAnalyze`（共有で受け取った画像）のときは圧縮とプレビューまでで止め、
   * 確認ダイアログで「読み取る」が選ばれたときだけ解析する。
   */
  const processImageFile = async (file: File, opts: { confirmBeforeAnalyze?: boolean } = {}) => {
    // スキャン中の再入（二重ペースト・ドロップ・連続選択）は無視する
    if (scanInFlight.current) return;
    // 確認シートを開いたまま次の画像を処理しない
    if (scanResult) {
      toast("確認中の読み取り結果を保存または破棄してから、次の画像を読み込んでください。", { type: "warning" });
      return;
    }
    // 別の画像を読み込むので、確認待ちの共有画像は取り下げる
    setSharedPending(null);

    const options = {
      maxSizeMB: 0.8,
      maxWidthOrHeight: 1200,
      useWebWorker: false,
      fileType: "image/jpeg"
    };

    scanInFlight.current = true;
    setLoading(true);
    setLoadingStep("compress");

    const abortScan = () => {
      scanInFlight.current = false;
      setLoading(false);
      setLoadingStep(null);
    };

    try {
      const compressedFile = await imageCompression(file, options);

      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target?.result;
        if (typeof base64 !== "string") {
          abortScan();
          toast("画像の読み込みに失敗しました", { type: "error" });
          return;
        }
        setPreview(base64);
        if (opts.confirmBeforeAnalyze) {
          // 解析はまだしない。プレビューを出したまま確認を待つ（キャンセルしてもプレビューは残す）
          abortScan();
          setSharedPending(base64);
          void confirmSharedAnalysis(base64);
          return;
        }
        analyzeImage(base64);
      };
      reader.onerror = () => {
        console.error("画像の読み込みに失敗しました");
        abortScan();
        toast("画像の読み込みに失敗しました", { type: "error" });
      };
      reader.readAsDataURL(compressedFile);
    } catch (error) {
      console.error(error);
      abortScan();
      toast("画像の処理に失敗しました", { type: "error" });
    }
  };

  // processImageFile / toast の最新版を参照するための ref（paste リスナーは一度しか登録しないため）
  const processImageFileRef = useRef(processImageFile);
  useEffect(() => {
    processImageFileRef.current = processImageFile;
    toastRef.current = toast;
  });

  // 画像処理
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    // スキャン中の再入は無視する
    if (scanInFlight.current) return;
    await processImageFile(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    // スキャン中の再入は無視する
    if (scanInFlight.current) return;

    if (!file.type.startsWith("image/")) {
      toast("画像ファイルのみアップロード可能です。", { type: "warning" });
      return;
    }

    await processImageFile(file);
  };

  // AI解析。成功したら保存せず、確認シートを開く
  const analyzeImage = async (base64: string) => {
    setLoadingStep("analyze");

    // クライアント側タイムアウト。サーバーの Gemini タイムアウト(30秒)より長めに取る
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ANALYZE_TIMEOUT_MS);

    try {
      let res: Response;
      try {
        res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: base64 }),
          signal: controller.signal,
        });
      } catch (fetchErr) {
        if (fetchErr instanceof DOMException && fetchErr.name === "AbortError") {
          throw new Error("解析がタイムアウトしました。通信環境を確認して、もう一度お試しください。");
        }
        throw new Error("サーバーに接続できませんでした。通信環境を確認して、もう一度お試しください。");
      }

      if (!res.ok) {
        let errData: Partial<AnalyzeErrorResponse> | null = null;
        try {
          errData = await res.json();
        } catch {
          errData = null;
        }
        const serverMessage = errData?.error;
        const suffix = errData?.requestId ? `（ID: ${errData.requestId}）` : "";

        let errorText: string;
        if (res.status === 401) {
          // ログイン必須。手動入力はログインなしでも使えることを伝える
          errorText = isSignedIn
            ? "セッションの有効期限が切れた可能性があります。ページを再読み込みして、もう一度お試しください。"
            : "AIスキャンにはログインが必要です。右上の「ログイン」からサインインするか、「手動で入力」から記録を追加してください（手動入力はログイン不要です）。";
        } else if (res.status === 422) {
          // 読み取れなかった／ブロックされた。プレビューは残すので撮り直し・手動入力に切り替えられる
          errorText = serverMessage || "レシート/メーターを読み取れませんでした。撮り直すか、「手動で入力」から記録してください。";
        } else if (res.status === 429) {
          const retryAfter = res.headers.get("Retry-After");
          const wait = retryAfter && /^\d+$/.test(retryAfter) ? `約${retryAfter}秒後に` : "しばらくしてから";
          errorText = `${serverMessage || "リクエストが多すぎます。"} ${wait}もう一度お試しください。`;
        } else if (res.status === 504) {
          errorText = serverMessage || "AI解析がタイムアウトしました。しばらくしてから、もう一度お試しください。";
        } else {
          errorText = (serverMessage || "サーバーエラーが発生しました。") + suffix;
        }
        throw new Error(errorText);
      }

      const data: AnalyzeSuccessResponse = await res.json();

      // 自動保存はしない。確認シートでユーザーが内容を確認・修正してから保存する
      // （妥当性チェックの注意文 `warnings` もシート内に表示する）
      scanKey.current += 1;
      setScanResult({ data, image: base64, key: scanKey.current });

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "解析に失敗しました。";
      toast(errorMessage, { type: "error" });
      console.error(err);
    } finally {
      clearTimeout(timeoutId);
      scanInFlight.current = false;
      setLoading(false);
      setLoadingStep(null);
    }
  };

  // 確認待ちの共有画像の解析を始める（確認ダイアログの「読み取る」またはプレビュー上の「読み取る」ボタン）
  const startSharedAnalysis = (base64: string) => {
    // 確認中に別の画像へ切り替わった・閉じられた・すでに解析中なら何もしない
    if (sharedPendingRef.current !== base64 || scanInFlight.current) return;
    setSharedPending(null);
    scanInFlight.current = true;
    setLoading(true);
    analyzeImage(base64);
  };

  // 共有で受け取った画像は、他サイトから送り込まれた可能性もあるため、読み取る前に確認する
  const confirmSharedAnalysis = async (base64: string) => {
    const ok = await confirm("共有された画像を読み取りますか？", { confirmLabel: "読み取る" });
    if (!ok) return; // プレビューは残し、「読み取る / 手動で入力 / 次を撮る」を選べるようにする
    startSharedAnalysis(base64);
  };

  /**
   * 重複チェック付きで記録を追加する。
   * 同じ日付・給油量・金額の記録があれば確認し、キャンセルなら false を返す。
   */
  const addRecordWithDuplicateCheck = useCallback(
    async (record: RecordInput): Promise<FuelRecord | null> => {
      if (findDuplicateRecord(records, record)) {
        const ok = await confirm(DUPLICATE_CONFIRM_MESSAGE, { danger: true, confirmLabel: "保存する" });
        if (!ok) return null;
      }
      return await addRecord(record);
    },
    [records, confirm, addRecord]
  );

  // 確認シートの「保存」
  const handleScanSave = async (record: RecordInput) => {
    try {
      const added = await addRecordWithDuplicateCheck(record);
      if (!added) return; // 重複確認でキャンセル
      setActiveRecordId(added.id);
      setActiveFromScan(true);
      setScanResult(null);
      toast("給油記録を保存しました", { type: "success" });
    } catch (err) {
      console.error(err);
      toast(err instanceof Error ? err.message : "保存に失敗しました", { type: "error" });
      throw err; // シートは開いたままにする
    }
  };

  // 確認シートの「破棄」（プレビューは残すので撮り直し・手動入力に切り替えられる）
  const handleScanDiscard = useCallback(() => {
    setScanResult(null);
  }, []);

  const clearPreview = () => {
    setPreview(null);
    setSharedPending(null);
  };

  const startEditing = (record: FuelRecord) => {
    form.reset(record, {
      vehicle: selectedVehicle,
      previousOdometer: previousOdometer(records, { recordId: record.id }),
      getPreviousOdometer,
      openRun: openRunBefore(records, selectedVehicle, { recordId: record.id }),
      getOpenRun,
    });
    setEditingRecordId(record.id);
    setIsManualEntry(false);
    setIsEditing(true);
  };

  const startManualEntry = () => {
    const today = todayLocalISO();
    form.reset(
      { date: today },
      {
        vehicle: selectedVehicle,
        previousOdometer: previousOdometer(records, { date: today }),
        getPreviousOdometer,
        openRun: openRunBefore(records, selectedVehicle, { date: today }),
        getOpenRun,
      }
    );
    setEditingRecordId(null);
    setIsManualEntry(true);
    setIsEditing(true);
    setActiveRecordId(null);
  };

  // PWA ショートカット「スキャン」: カメラ/ファイル選択を開く。
  // ユーザー操作なしの呼び出しはブラウザにブロックされうるため、カメラボタンへフォーカスして押しやすくする
  const handleShortcutScan = useCallback(() => {
    const button = cameraButtonRef.current;
    if (button) {
      button.scrollIntoView({ block: "center" });
      button.focus({ preventScroll: true });
    }
    cameraInputRef.current?.click();
  }, []);

  // Web Share Target: Service Worker が IndexedDB に置いた共有画像を取り出し（URL の `t` と一致し、10 分以内のものだけ）、
  // 圧縮してプレビューに出す。/share へは他サイトからも POST できるため、自動では解析せず
  // 「読み取りますか？」の確認後にギャラリーと同じ経路（解析 → 確認シート）へ流す。
  // 未ログインでもプレビューは表示され、解析の 401 で「ログインが必要」の案内が出る。
  const handleSharedImage = useCallback((token: string | null) => {
    void (async () => {
      const file = await takeSharedImage(token ?? undefined);
      if (!file) {
        toastRef.current("共有された画像が見つかりませんでした", { type: "warning" });
        return;
      }
      if (!file.type.startsWith("image/")) {
        toastRef.current("画像ファイルのみ読み込めます。", { type: "warning" });
        return;
      }
      await processImageFileRef.current(file, { confirmBeforeAnalyze: true });
    })();
  }, []);

  // SW がまだ有効でなく共有がサーバーの /share に届いた場合（画像は受け取っていない）、
  // または SW が共有から画像を取り出せなかった場合
  const handleShareUnavailable = useCallback(() => {
    toastRef.current(
      "共有された画像を受け取れませんでした。もう一度お試しください（インストール直後は数秒かかることがあります）",
      { type: "warning" }
    );
  }, []);

  const cancelEditing = () => {
    setIsEditing(false);
    setIsManualEntry(false);
    setEditingRecordId(null);
  };

  // 車両を切り替えたら開いているフォーム（編集・手動入力）を閉じる。
  // 開いたままだと、切り替え前の車両の記録を更新してしまうため。
  // 距離の入力方式を切り替えたときも、フォームの入力欄（走行距離 / オドメーター）が合わなくなるので閉じる。
  // （エフェクトではなく「前回の値を state に保持してレンダー中に調整する」React 推奨パターン）
  const [formScopeKey, setFormScopeKey] = useState(scopeKey);
  if (formScopeKey !== scopeKey) {
    setFormScopeKey(scopeKey);
    cancelEditing();
  }

  const saveEditing = async () => {
    if (saving || !form.isValid) return;
    if (isManualEntry && !form.hasCoreValue) return;

    const record = form.toRecord();
    setSaving(true);
    try {
      if (isManualEntry) {
        const added = await addRecordWithDuplicateCheck(record);
        if (!added) return; // 重複確認でキャンセル。フォームは開いたまま
        setActiveRecordId(added.id);
        setActiveFromScan(false);
        toast("給油記録を保存しました", { type: "success" });
      } else {
        if (!editingRecordId) return;
        await updateRecord(editingRecordId, record);
        toast("給油記録を更新しました", { type: "success" });
      }
      setIsEditing(false);
      setIsManualEntry(false);
      setEditingRecordId(null);
    } catch (err) {
      console.error(err);
      toast(err instanceof Error ? err.message : "保存に失敗しました", { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  // 表示するレコードの決定ロジック
  const displayRecord = activeRecordId
    ? records.find(r => r.id === activeRecordId) || records[0]
    : records[0];

  const currentVehicleName = mounted
    ? vehicles.find(v => v.id === selectedVehicleId)?.name || "車両"
    : "車両";

  // ショートカット実行条件: スキャンは読み込み完了かつ解析中・確認中でないこと、手動入力はさらに閲覧専用でないこと
  const shortcutScanReady = mounted && !isLoading && !loading && !scanResult;
  const shortcutManualReady = mounted && !isLoading && !readOnly;
  // 共有画像はスキャンと同じ条件に加え、ログイン状態の確定を待つ（401 時の案内文を正しく出すため）
  const sharedImageReady = shortcutScanReady && authLoaded;

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white p-4 md:p-8 pb-32 font-sans flex flex-col items-center">
      <Suspense fallback={null}>
        <ShortcutActionHandler
          scanReady={shortcutScanReady}
          manualReady={shortcutManualReady}
          sharedReady={sharedImageReady}
          noticeReady={mounted}
          onScan={handleShortcutScan}
          onManual={startManualEntry}
          onShared={handleSharedImage}
          onShareUnavailable={handleShareUnavailable}
        />
      </Suspense>
      <div className="w-full max-w-5xl">

        {/* ヘッダー */}
        <PageHeader title="FuelLens" icon={Fuel} links={HOME_HEADER_LINKS} />

        {/* データ取得エラー / 閲覧専用の表示 */}
        <HookErrorLine error={hookError} />
        <ReadOnlyCaption show={readOnly} />

        {/* 車両切り替えセレクタータブ（車両の読み込み中はスケルトン） */}
        <VehicleSelector
          loading={vehiclesLoading}
          vehicles={vehicles}
          selectedVehicleId={selectedVehicleId}
          onSelect={setSelectedVehicleId}
          onAddVehicle={vehicleActions.addVehicle}
          onDeleteVehicle={vehicleActions.deleteVehicle}
          onUpdateVehicle={vehicleActions.updateVehicle}
          readOnly={readOnly}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start w-full">
          <div className="flex flex-col gap-6 w-full">
            {/* アクションエリア */}
            {isLoading ? (
              <div className="relative overflow-hidden bg-gray-800/40 backdrop-blur-xl border border-gray-700/50 rounded-3xl shadow-2xl w-full">
                <div className="p-6 flex flex-col items-center gap-6 text-center">
                  <div className="space-y-1">
                    <h2 className="text-lg font-semibold text-white">スキャンして記録</h2>
                    <p className="text-xs text-blue-500/40">対象: 車両</p>
                    <p className="text-sm text-gray-500">レシートとメーターを1枚に収めて撮影</p>
                  </div>
                  <div className="w-24 h-24 rounded-full bg-gray-800/60 animate-pulse border-4 border-gray-800/30" />
                  <div className="w-32 h-9 bg-gray-800/40 rounded-full animate-pulse" />
                </div>
              </div>
            ) : (
              <div
                onDragOver={handleDragOver}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`relative overflow-hidden bg-gray-800/40 backdrop-blur-xl border rounded-3xl shadow-2xl transition-all duration-300 w-full ${
                  isDragging ? "border-blue-500 bg-blue-500/10 scale-[1.01]" : "border-gray-700/50"
                }`}
              >
                {isDragging && (
                  <div className="absolute inset-0 z-50 bg-blue-600/20 border-2 border-dashed border-blue-500 rounded-3xl flex flex-col items-center justify-center backdrop-blur-xs pointer-events-none transition-all duration-300">
                    <div className="bg-gray-900/90 border border-blue-500/30 p-4 rounded-2xl flex flex-col items-center gap-2 shadow-2xl animate-pulse">
                      <Camera className="w-8 h-8 text-blue-400" />
                      <p className="text-sm font-bold text-white">ここに画像をドロップして解析</p>
                    </div>
                  </div>
                )}

                {loading && (
                  <div className="absolute inset-0 z-50 bg-black/60 flex flex-col items-center justify-center backdrop-blur-sm">
                    <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-3" />
                    <p className="text-blue-200 font-medium animate-pulse text-sm">
                      {loadingStep === "compress" ? "画像を圧縮中..." : "AIが解析中..."}
                    </p>
                  </div>
                )}

                <div className={isDragging ? "pointer-events-none" : ""}>
                  {preview ? (
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={preview}
                        alt="Preview"
                        className="w-full max-h-[300px] object-cover opacity-90"
                        draggable="false"
                      />
                      {!loading && (
                        <button
                          type="button"
                          onClick={clearPreview}
                          aria-label="プレビューを閉じる"
                          className="absolute top-3 right-3 p-2 bg-black/50 rounded-full text-white backdrop-blur hover:bg-black/70 transition pointer-events-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                        >
                          <X className="w-5 h-5" aria-hidden="true" />
                        </button>
                      )}
                      {!loading && (
                        <div className="absolute bottom-3 right-3 flex flex-wrap justify-end gap-2">
                          {/* 共有で受け取り、確認ダイアログで読み取らなかった画像 */}
                          {sharedPending && (
                            <>
                              <button
                                type="button"
                                onClick={() => startSharedAnalysis(sharedPending)}
                                className="bg-emerald-600/90 hover:bg-emerald-500 text-white text-xs font-bold py-2 px-4 rounded-full shadow-lg backdrop-blur flex items-center gap-2 pointer-events-auto"
                              >
                                <Calculator className="w-3 h-3" aria-hidden="true" /> 読み取る
                              </button>
                              <button
                                type="button"
                                onClick={startManualEntry}
                                disabled={readOnly}
                                className="bg-gray-800/90 hover:bg-gray-700 text-white text-xs font-bold py-2 px-4 rounded-full shadow-lg backdrop-blur flex items-center gap-2 pointer-events-auto disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <Edit2 className="w-3 h-3" aria-hidden="true" /> 手動で入力
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => cameraInputRef.current?.click()}
                            className="bg-blue-600/90 hover:bg-blue-500 text-white text-xs font-bold py-2 px-4 rounded-full shadow-lg backdrop-blur flex items-center gap-2 pointer-events-auto"
                          >
                            <Camera className="w-3 h-3" aria-hidden="true" /> 次を撮る
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-6 flex flex-col items-center gap-6">
                      <div className="text-center space-y-1">
                        <h2 className="text-lg font-semibold text-white">スキャンして記録</h2>
                        <p className="text-xs text-blue-400 font-semibold">対象: {currentVehicleName}</p>
                        <p className="text-sm text-gray-400">レシートとメーターを1枚に収めて撮影</p>
                        <p className="text-xs text-amber-500/80 pt-1">
                          {distanceMode === "odometer"
                            ? "メーターはオドメーター（積算距離）が写るように撮影してください"
                            : "走行距離はトリップメーター（前回給油からの区間距離）を入力してください"}
                        </p>
                      </div>

                      <button
                        type="button"
                        ref={cameraButtonRef}
                        onClick={() => cameraInputRef.current?.click()}
                        disabled={loading}
                        aria-label="カメラで撮影してスキャン"
                        className="group relative w-24 h-24 rounded-full bg-gradient-to-b from-blue-500 to-blue-700 shadow-[0_0_40px_-10px_rgba(59,130,246,0.5)] flex items-center justify-center transition-transform active:scale-95 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300/60"
                      >
                        <div className="absolute inset-0 rounded-full border-4 border-blue-400/30 group-hover:border-blue-400/50 transition-colors" />
                        <Camera className="w-10 h-10 text-white fill-blue-500" aria-hidden="true" />
                      </button>

                      <div className="flex items-center gap-4">
                        <button
                          type="button"
                          onClick={() => galleryInputRef.current?.click()}
                          disabled={loading}
                          className="flex items-center gap-2 text-sm text-gray-500 hover:text-blue-400 transition-colors py-2 px-4 rounded-full hover:bg-gray-800"
                        >
                          <ImageIcon className="w-4 h-4" aria-hidden="true" />
                          <span>アルバムから選択</span>
                        </button>
                        <button
                          type="button"
                          onClick={startManualEntry}
                          disabled={loading || readOnly}
                          className="flex items-center gap-2 text-sm text-gray-500 hover:text-blue-400 transition-colors py-2 px-4 rounded-full hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Edit2 className="w-4 h-4" aria-hidden="true" />
                          <span>手動で入力</span>
                        </button>
                      </div>

                      <p className="text-xs text-gray-500">画像のペースト（Ctrl+V）にも対応</p>
                      {mounted && authLoaded && !isSignedIn && (
                        <p className="text-xs text-amber-500/80 text-center">
                          AIスキャンはログイン後に利用できます。「手動で入力」はログインなしでも使えます。
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            <input type="file" accept="image/*" capture="environment" className="hidden" ref={cameraInputRef} onChange={handleFileChange} aria-label="カメラで撮影" />
            <input type="file" accept="image/*" className="hidden" ref={galleryInputRef} onChange={handleFileChange} aria-label="画像ファイルを選択" />
          </div>

          {/* 右カラム (最新リザルト + 履歴ボタン) */}
          <div className="flex flex-col gap-6 w-full">
            {/* 最新リザルトカード */}
            {isLoading ? (
              <div>
                <div className="flex items-center justify-between px-2 mb-2">
                  <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                    <Calculator className="w-4 h-4" /> Latest Record
                  </h3>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden w-full">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <div className="w-12 h-3 bg-gray-800 rounded animate-pulse mb-2" />
                      <div className="flex items-baseline gap-1">
                        <div className="w-24 h-9 bg-gray-800 rounded animate-pulse" />
                        <span className="text-sm font-bold text-blue-500">km/L</span>
                      </div>
                    </div>
                    <div className="text-right flex flex-col items-end">
                      <div className="w-16 h-7 bg-gray-800 rounded animate-pulse mb-1" />
                      <p className="text-xs text-gray-500">Total Cost</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 bg-black/20 rounded-xl p-4 border border-white/5">
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase mb-2">給油量</p>
                      <div className="w-12 h-5 bg-gray-800 rounded animate-pulse" />
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase mb-2">走行距離</p>
                      <div className="w-16 h-5 bg-gray-800 rounded animate-pulse" />
                    </div>
                    <div className="col-span-2 flex items-center gap-2 pt-2 border-t border-white/5">
                      <MapPin className="w-3 h-3 text-gray-500" />
                      <div className="w-24 h-3 bg-gray-800 rounded animate-pulse" />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mb-8 w-full">
                <div className="flex items-center justify-between px-2 mb-2">
                  <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                    <Calculator className="w-4 h-4" /> {isManualEntry ? "New Record" : (displayRecord && activeFromScan && activeRecordId === displayRecord.id ? "Scanned Result" : "Latest Record")}
                  </h3>
                  {displayRecord && !isEditing && (
                    <button
                      type="button"
                      onClick={() => startEditing(displayRecord)}
                      disabled={readOnly}
                      className="text-xs text-blue-400 flex items-center gap-1 hover:text-blue-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Edit2 className="w-3 h-3" aria-hidden="true" /> 編集
                    </button>
                  )}
                </div>

                {(displayRecord || (isEditing && isManualEntry)) ? (
                  <div className={`relative overflow-hidden rounded-3xl border transition-colors duration-300 w-full ${isEditing ? 'bg-gray-800 border-blue-500 ring-1 ring-blue-500' : 'bg-gradient-to-br from-gray-800 to-gray-900 border-gray-700'}`}>
                    {/* 編集モード */}
                    {isEditing ? (
                      <div className="p-5">
                        <h3 className="text-sm font-bold text-gray-300 mb-4">{isManualEntry ? "手動で記録を追加" : "給油記録の編集"}</h3>
                        <EditFuelRecordForm
                          form={form}
                          onCancel={cancelEditing}
                          onSave={saveEditing}
                          saving={saving}
                          disabled={readOnly}
                          canSave={!isManualEntry || form.hasCoreValue}
                          saveHint="保存するには給油量または支払総額を入力してください"
                        />
                      </div>
                    ) : (
                      /* 表示モード */
                      <div className="p-6">
                        <div className="flex justify-between items-start mb-6">
                          <div>
                            <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                              <Calendar className="w-3 h-3" /> {displayRecord.date || "日付不明"}
                            </p>
                            <div className="flex items-baseline gap-1">
                              <span className="text-4xl font-bold text-white font-mono tracking-tighter">
                                {displayRecord.fuel_efficiency ? displayRecord.fuel_efficiency.toFixed(2) : "--.--"}
                              </span>
                              <span className="text-sm font-bold text-blue-500">km/L</span>
                            </div>
                            {efficiencyNullReason(displayRecord) && (
                              <p className="text-[11px] text-gray-500 mt-0.5">燃費: {efficiencyNullReason(displayRecord)}</p>
                            )}
                            <RecordBadges record={displayRecord} className="mt-2" />
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-bold text-green-400 font-mono">
                              ¥{displayRecord.total_cost?.toLocaleString() || "---"}
                            </p>
                            <p className="text-xs text-gray-500">Total Cost</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 bg-black/20 rounded-xl p-4 border border-white/5">
                          <div>
                            <p className="text-[10px] text-gray-400 uppercase">給油量</p>
                            <p className="text-lg font-mono font-bold text-blue-200">{displayRecord.fuel_amount ?? "--"} <span className="text-xs text-gray-500">L</span></p>
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-400 uppercase">{distanceMode === "odometer" ? "区間距離" : "走行距離"}</p>
                            <p className="text-lg font-mono font-bold text-gray-200">{displayRecord.total_distance ?? "--"} <span className="text-xs text-gray-500">km</span></p>
                          </div>
                          {distanceMode === "odometer" && (
                            <p className="col-span-2 text-xs font-mono text-gray-400">{formatOdometer(displayRecord.odometer)}</p>
                          )}
                          <div className="col-span-2 flex items-center gap-2 pt-2 border-t border-white/5">
                             <MapPin className="w-3 h-3 text-gray-500" />
                            <p className="text-xs text-gray-400 truncate">{displayRecord.gas_station || "場所不明"}</p>
                          </div>
                          {displayRecord.memo && (
                            <p className="col-span-2 text-xs text-gray-400 truncate" title={displayRecord.memo}>
                              <span className="sr-only">メモ: </span>{displayRecord.memo}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-gray-900/30 border border-gray-800/80 rounded-3xl p-8 text-center flex flex-col items-center justify-center min-h-[220px] w-full">
                    <div className="w-12 h-12 rounded-full bg-gray-800/50 flex items-center justify-center mb-3">
                      <Fuel className="w-6 h-6 text-gray-500" />
                    </div>
                    <p className="text-sm font-bold text-gray-300 mb-1">給油記録がまだありません</p>
                    <p className="text-xs text-gray-500 max-w-[280px] leading-relaxed">
                      レシートやメーターの写真をスキャンするか、過去の記録を入力して最初の記録を作成しましょう！
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* 履歴画面へのリンクボタン */}
            <div className="mt-auto w-full">
              <Link
                href="/history"
                className="group flex items-center justify-between w-full p-4 md:p-6 rounded-2xl bg-gray-900 border border-gray-800 hover:border-gray-700 transition"
              >
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-gray-800 rounded-xl">
                    <History className="w-6 h-6 text-gray-400" />
                  </div>
                  <div>
                    <p className="text-base md:text-lg font-bold text-gray-200">過去の記録を見る</p>
                    <p className="text-sm text-gray-500">対象: {currentVehicleName}</p>
                  </div>
                </div>
                <ChevronRight className="w-6 h-6 text-gray-500 group-hover:text-white transition" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* スキャン結果の確認シート（保存は「保存」を押したときのみ） */}
      {scanResult && (
        <ScanReviewSheet
          key={scanResult.key}
          result={scanResult.data}
          imageSrc={scanResult.image}
          vehicle={selectedVehicle}
          previousOdometer={previousOdometer(records, { date: scanResult.data.date ?? todayLocalISO() })}
          getPreviousOdometer={getPreviousOdometer}
          openRun={openRunBefore(records, selectedVehicle, { date: scanResult.data.date ?? todayLocalISO() })}
          getOpenRun={getOpenRun}
          readOnly={readOnly}
          onSave={handleScanSave}
          onDiscard={handleScanDiscard}
        />
      )}
    </main>
  );
}
