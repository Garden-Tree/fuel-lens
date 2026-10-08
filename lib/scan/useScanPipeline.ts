"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { analyzeErrorMessage, type AnalyzeSuccessResponse } from "@/lib/analyze";
import { takeSharedImage } from "@/lib/shareInbox";
import { ANALYZE_TIMEOUT_MS, compressToDataUrl, requestAnalyze } from "./analyzeClient";

type ToastFn = (message: string, options?: { type?: "info" | "success" | "warning" | "error" }) => void;
type ConfirmFn = (message: string, options?: { confirmLabel?: string; danger?: boolean }) => Promise<boolean>;

/** スキャンの段階（圧縮中 / 解析中）。スキャンしていなければ null */
export type ScanLoadingStep = "compress" | "analyze" | null;

/** 確認シートに表示中の読み取り結果。key は読み取りごとに増える（シートを作り直すため） */
export type ScanResult = { data: AnalyzeSuccessResponse; image: string; key: number };

export type UseScanPipelineOptions = {
  /** ログイン中か（401 の案内文の切り替え）。useAuth().isSignedIn */
  isSignedIn: boolean | undefined;
  /** useToast().toast / confirm。lib から components へ依存しないよう、呼び出し側から渡す */
  toast: ToastFn;
  confirm: ConfirmFn;
};

export type ScanPipeline = {
  /** スキャン（圧縮 → 解析）中か */
  loading: boolean;
  loadingStep: ScanLoadingStep;
  /** プレビュー中の画像（圧縮済み data URL） */
  preview: string | null;
  /** 共有で受け取り、まだ解析していない画像（プレビューと同じ data URL）。無ければ null */
  sharedPending: string | null;
  /** 確認シートに表示中の読み取り結果。無ければ null */
  scanResult: ScanResult | null;
  /** スキャン中か（ref で同期的に判定する。state の loading は再レンダー待ちで古い値を返しうるため） */
  isScanning: () => boolean;
  /**
   * 画像を圧縮してプレビューに出し、解析する（成功したら確認シートを開く。自動保存はしない）。
   * `confirmBeforeAnalyze`（共有で受け取った画像）のときは圧縮とプレビューまでで止め、
   * 確認ダイアログで「読み取る」が選ばれたときだけ解析する。
   */
  processImageFile: (file: File, opts?: { confirmBeforeAnalyze?: boolean }) => Promise<void>;
  /** Web Share Target: SW が IndexedDB に置いた共有画像を取り出し、確認付きで processImageFile に流す */
  processSharedImage: (token: string | null) => Promise<void>;
  /** 確認待ちの共有画像の解析を始める（プレビュー上の「読み取る」） */
  startSharedAnalysis: (dataUrl: string) => void;
  /** プレビューを閉じる（確認待ちの共有画像も取り下げる） */
  clearPreview: () => void;
  /** 確認シートを閉じる（保存後・破棄。プレビューは残すので撮り直し・手動入力に切り替えられる） */
  discardResult: () => void;
  /** 進行中のスキャンを中断する（toast は出さない）。アンマウント時にも中断する */
  abort: () => void;
};

const SHARED_CONFIRM_MESSAGE = "共有された画像を読み取りますか？";

/**
 * スキャンの状態（読み込み中・段階・プレビュー・確認待ちの共有画像・確認シート）と処理の流れ
 * （圧縮 → POST /api/analyze → 確認シート）をまとめるフック。
 * I/O は lib/scan/analyzeClient.ts、エラー文言は lib/analyze.ts の analyzeErrorMessage。
 */
export function useScanPipeline({ isSignedIn, toast, confirm }: UseScanPipelineOptions): ScanPipeline {
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<ScanLoadingStep>(null);
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
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const scanKey = useRef(0);

  // スキャン（圧縮→解析）が進行中かどうか。同期的な再入防止に使う
  const scanInFlight = useRef(false);
  // 解析リクエストの中断用
  const controllerRef = useRef<AbortController | null>(null);
  // abort() のたびに増える。圧縮の完了後に中断済みかを判定する
  const generationRef = useRef(0);

  const finishScan = useCallback(() => {
    scanInFlight.current = false;
    controllerRef.current = null;
    setLoading(false);
    setLoadingStep(null);
  }, []);

  const abort = useCallback(() => {
    generationRef.current += 1;
    controllerRef.current?.abort();
    finishScan();
  }, [finishScan]);

  // 画面を離れたら解析リクエストを中断する
  useEffect(() => {
    return () => {
      generationRef.current += 1;
      controllerRef.current?.abort();
    };
  }, []);

  // AI解析。成功したら保存せず、確認シートを開く。呼び出し前に scanInFlight を立てておくこと
  const analyzeImage = async (dataUrl: string) => {
    setLoadingStep("analyze");
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const res = await requestAnalyze(dataUrl, { signal: controller.signal, timeoutMs: ANALYZE_TIMEOUT_MS });
      if (controller.signal.aborted) return;
      if (!res.ok) {
        throw new Error(analyzeErrorMessage(res.status, res.body, { isSignedIn, retryAfter: res.retryAfter }));
      }
      if (typeof res.body !== "object" || res.body === null) throw new Error("解析に失敗しました。");
      // 自動保存はしない。確認シートでユーザーが内容を確認・修正してから保存する
      // （妥当性チェックの注意文 `warnings` もシート内に表示する）
      scanKey.current += 1;
      setScanResult({ data: res.body as AnalyzeSuccessResponse, image: dataUrl, key: scanKey.current });
    } catch (err: unknown) {
      if (controller.signal.aborted) return; // abort() による中断は通知しない
      toast(err instanceof Error ? err.message : "解析に失敗しました。", { type: "error" });
      console.error(err);
    } finally {
      // abort() 済み（または次のスキャンが始まった）なら状態は触らない
      if (controllerRef.current === controller) finishScan();
    }
  };

  // 確認待ちの共有画像の解析を始める（確認ダイアログの「読み取る」またはプレビュー上の「読み取る」ボタン）
  const startSharedAnalysis = (dataUrl: string) => {
    // 確認中に別の画像へ切り替わった・閉じられた・すでに解析中なら何もしない
    if (sharedPendingRef.current !== dataUrl || scanInFlight.current) return;
    setSharedPending(null);
    scanInFlight.current = true;
    setLoading(true);
    void analyzeImage(dataUrl);
  };

  // 共有で受け取った画像は、他サイトから送り込まれた可能性もあるため、読み取る前に確認する
  const confirmSharedAnalysis = async (dataUrl: string) => {
    const ok = await confirm(SHARED_CONFIRM_MESSAGE, { confirmLabel: "読み取る" });
    if (!ok) return; // プレビューは残し、「読み取る / 手動で入力 / 次を撮る」を選べるようにする
    startSharedAnalysis(dataUrl);
  };

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

    scanInFlight.current = true;
    const generation = generationRef.current;
    setLoading(true);
    setLoadingStep("compress");

    let dataUrl: string;
    try {
      dataUrl = await compressToDataUrl(file);
    } catch (error) {
      if (generation !== generationRef.current) return;
      finishScan();
      toast(error instanceof Error ? error.message : "画像の処理に失敗しました", { type: "error" });
      return;
    }
    if (generation !== generationRef.current) return;

    setPreview(dataUrl);
    if (opts.confirmBeforeAnalyze) {
      // 解析はまだしない。プレビューを出したまま確認を待つ（キャンセルしてもプレビューは残す）
      finishScan();
      setSharedPending(dataUrl);
      void confirmSharedAnalysis(dataUrl);
      return;
    }
    await analyzeImage(dataUrl);
  };

  // processSharedImage は IndexedDB の読み出しを待つので、その後は最新の processImageFile を使う
  const processImageFileRef = useRef(processImageFile);
  useEffect(() => {
    processImageFileRef.current = processImageFile;
  });

  // Web Share Target: Service Worker が IndexedDB に置いた共有画像を取り出し（URL の `t` と一致し、10 分以内のものだけ）、
  // 圧縮してプレビューに出す。/share へは他サイトからも POST できるため、自動では解析せず
  // 「読み取りますか？」の確認後にギャラリーと同じ経路（解析 → 確認シート）へ流す。
  // 未ログインでもプレビューは表示され、解析の 401 で「ログインが必要」の案内が出る。
  const processSharedImage = async (token: string | null) => {
    const file = await takeSharedImage(token ?? undefined);
    if (!file) {
      toast("共有された画像が見つかりませんでした", { type: "warning" });
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast("画像ファイルのみ読み込めます。", { type: "warning" });
      return;
    }
    await processImageFileRef.current(file, { confirmBeforeAnalyze: true });
  };

  const clearPreview = () => {
    setPreview(null);
    setSharedPending(null);
  };

  const discardResult = useCallback(() => {
    setScanResult(null);
  }, []);

  const isScanning = useCallback(() => scanInFlight.current, []);

  return {
    loading,
    loadingStep,
    preview,
    sharedPending,
    scanResult,
    isScanning,
    processImageFile,
    processSharedImage,
    startSharedAnalysis,
    clearPreview,
    discardResult,
    abort,
  };
}
