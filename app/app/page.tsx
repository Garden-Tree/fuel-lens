"use client";

import { useState, useRef, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { SignedIn, SignedOut, SignInButton, UserButton, useAuth } from "@clerk/nextjs";
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
  ChevronRight,
  BarChart3,
  Settings
} from "lucide-react";
import imageCompression from "browser-image-compression";
import { useFuelRecords, FuelRecord } from "@/lib/useFuelRecords";
import EditFuelRecordForm from "@/components/EditFuelRecordForm";
import ScanReviewSheet from "@/components/ScanReviewSheet";
import { useVehicles } from "@/lib/useVehicles";
import VehicleSelector from "@/components/VehicleSelector";
import { useToast } from "@/components/Toast";
import { useRecordForm, findDuplicateRecord, todayLocalISO, type RecordInput } from "@/lib/useRecordForm";
import type { AnalyzeErrorResponse, AnalyzeSuccessResponse } from "@/lib/analyze";

/** /api/analyze 呼び出しのクライアント側タイムアウト（サーバー側は Gemini 30秒 + 関数全体 60秒） */
const ANALYZE_TIMEOUT_MS = 45_000;

const DUPLICATE_CONFIRM_MESSAGE = "同じ日付・給油量・金額の記録が既にあります。重複して保存しますか？";

/**
 * PWA ショートカット（manifest の `/app?action=scan` / `/app?action=manual`）を処理する。
 * useSearchParams を使うため、呼び出し側で <Suspense> で囲み /app の静的プリレンダーを保つ。
 * アクションは 1 ページロードにつき最大 1 回だけ実行し、実行後に `action` パラメータを URL から消す。
 */
function ShortcutActionHandler({
  scanReady,
  manualReady,
  onScan,
  onManual,
}: {
  scanReady: boolean;
  manualReady: boolean;
  onScan: () => void;
  onManual: () => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const action = searchParams.get("action");
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
    } else {
      return;
    }
    router.replace("/app");
  }, [action, scanReady, manualReady, onScan, onManual, router]);

  return null;
}

export default function Home() {
  const { toast, confirm } = useToast();
  // paste リスナーは一度しか登録しないため、最新の toast を ref 経由で参照する
  const toastRef = useRef(toast);
  // AIスキャンはログイン必須（/api/analyze が 401 を返す）。未ログイン時のヒント表示に使う
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  // 車両管理フックの統合
  const {
    vehicles,
    selectedVehicleId,
    setSelectedVehicleId,
    addVehicle,
    deleteVehicle,
    updateVehicle,
    loading: vehiclesLoading,
    error: vehiclesError,
    readOnly: vehiclesReadOnly,
  } = useVehicles();
  // 選択中車両IDと既定（先頭）車両IDを渡してレコード一覧を動的に同期。
  // 既定車両IDは、未分類（vehicle_id=null）の記録をどの車両に含めるか判定するために使う。
  // 車両一覧の読み込みが終わるまでレコードの読み込みは保留する。
  const {
    records,
    addRecord,
    updateRecord,
    loading: recordsLoading,
    error: recordsError,
    readOnly,
  } = useFuelRecords(selectedVehicleId, vehicles[0]?.id, { enabled: !vehiclesLoading });

  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<"compress" | "analyze" | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

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

  const isLoading = vehiclesLoading || recordsLoading;

  const processImageFile = async (file: File) => {
    // スキャン中の再入（二重ペースト・ドロップ・連続選択）は無視する
    if (scanInFlight.current) return;
    // 確認シートを開いたまま次の画像を処理しない
    if (scanResult) {
      toast("確認中の読み取り結果を保存または破棄してから、次の画像を読み込んでください。", { type: "warning" });
      return;
    }

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
  };

  const startEditing = (record: FuelRecord) => {
    form.reset(record);
    setEditingRecordId(record.id);
    setIsManualEntry(false);
    setIsEditing(true);
  };

  const startManualEntry = () => {
    form.reset({ date: todayLocalISO() });
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

  const cancelEditing = () => {
    setIsEditing(false);
    setIsManualEntry(false);
    setEditingRecordId(null);
  };

  // 車両を切り替えたら開いているフォーム（編集・手動入力）を閉じる。
  // 開いたままだと、切り替え前の車両の記録を更新してしまうため。
  // （エフェクトではなく「前回の値を state に保持してレンダー中に調整する」React 推奨パターン）
  const [formVehicleId, setFormVehicleId] = useState(selectedVehicleId);
  if (formVehicleId !== selectedVehicleId) {
    setFormVehicleId(selectedVehicleId);
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

  const hookError = vehiclesError || recordsError;

  // ショートカット実行条件: スキャンは読み込み完了かつ解析中・確認中でないこと、手動入力はさらに閲覧専用でないこと
  const shortcutScanReady = mounted && !isLoading && !loading && !scanResult;
  const shortcutManualReady = mounted && !isLoading && !readOnly;

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white p-4 md:p-8 pb-32 font-sans flex flex-col items-center">
      <Suspense fallback={null}>
        <ShortcutActionHandler
          scanReady={shortcutScanReady}
          manualReady={shortcutManualReady}
          onScan={handleShortcutScan}
          onManual={startManualEntry}
        />
      </Suspense>
      <div className="w-full max-w-5xl">

        {/* ヘッダー */}
        <header className="flex items-center justify-between py-4 mb-2 w-full">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-gradient-to-tr from-blue-600 to-cyan-400 rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/20">
              <Fuel className="text-white w-6 h-6 fill-current" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">FuelLens</h1>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/stats" aria-label="グラフ" className="p-2 bg-gray-800/50 rounded-full border border-gray-700/50 text-gray-400 hover:text-white transition group flex items-center gap-2">
              <span className="hidden md:inline text-sm font-semibold pr-1">グラフ</span>
              <BarChart3 className="w-5 h-5" aria-hidden="true" />
            </Link>
            <Link href="/history" aria-label="給油履歴" className="p-2 bg-gray-800/50 rounded-full border border-gray-700/50 text-gray-400 hover:text-white transition group flex items-center gap-2">
              <span className="hidden md:inline text-sm font-semibold pr-1">給油履歴</span>
              <History className="w-5 h-5" aria-hidden="true" />
            </Link>
            <Link href="/settings" aria-label="設定" className="p-2 bg-gray-800/50 rounded-full border border-gray-700/50 text-gray-400 hover:text-white transition group flex items-center gap-2">
              <Settings className="w-5 h-5" aria-hidden="true" />
            </Link>

            <SignedOut>
              <SignInButton forceRedirectUrl="/app">
                <button className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold py-1.5 px-4 rounded-full transition shadow-lg">
                  ログイン
                </button>
              </SignInButton>
            </SignedOut>
            <SignedIn>
              <UserButton />
            </SignedIn>
          </div>
        </header>

        {/* データ取得エラー / 閲覧専用の表示 */}
        {hookError && (
          <p role="alert" className="text-xs text-red-400 mb-2 px-1">{hookError}</p>
        )}
        {mounted && readOnly && (
          <p role="status" className="text-[11px] text-amber-400/90 mb-2 px-1">閲覧専用（クラウド接続待ち）</p>
        )}

        {/* 車両切り替えセレクタータブ */}
        {vehiclesLoading ? (
          <div className="w-full mb-6">
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
              <div className="flex items-center gap-2 p-1.5 bg-gray-950/40 border border-gray-800/80 rounded-2xl shadow-inner">
                <div className="w-20 h-8 md:h-[36px] bg-gray-850 rounded-xl animate-pulse" />
                <div className="w-20 h-8 md:h-[36px] bg-gray-850 rounded-xl animate-pulse" />
                <div className="w-[34px] h-[34px] bg-gray-850 rounded-xl animate-pulse" />
              </div>
            </div>
          </div>
        ) : (
          <VehicleSelector
            vehicles={vehicles}
            selectedVehicleId={selectedVehicleId}
            onSelect={setSelectedVehicleId}
            onAddVehicle={addVehicle}
            onDeleteVehicle={deleteVehicle}
            onUpdateVehicle={updateVehicle}
            readOnly={vehiclesReadOnly}
          />
        )}

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
                        <div className="absolute bottom-3 right-3 flex gap-2">
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
                        <p className="text-xs text-amber-500/80 pt-1">走行距離はトリップメーター（前回給油からの区間距離）を入力してください</p>
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
                            <p className="text-[10px] text-gray-400 uppercase">走行距離</p>
                            <p className="text-lg font-mono font-bold text-gray-200">{displayRecord.total_distance ?? "--"} <span className="text-xs text-gray-500">km</span></p>
                          </div>
                          <div className="col-span-2 flex items-center gap-2 pt-2 border-t border-white/5">
                             <MapPin className="w-3 h-3 text-gray-500" />
                            <p className="text-xs text-gray-400 truncate">{displayRecord.gas_station || "場所不明"}</p>
                          </div>
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
          readOnly={readOnly}
          onSave={handleScanSave}
          onDiscard={handleScanDiscard}
        />
      )}
    </main>
  );
}
