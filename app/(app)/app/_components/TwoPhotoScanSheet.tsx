"use client";

import { useEffect, useId, useRef, useState, type ChangeEvent, type Ref } from "react";
import { ArrowUpDown, Camera, Gauge, Image as ImageIcon, Receipt, ScanLine, X } from "lucide-react";
import Modal from "@/components/Modal";
import { readAsDataUrl } from "@/lib/scan/analyzeClient";
import type { DistanceMode } from "@/lib/types";

/** 2 枚のうちどちらか */
export type PairRole = "receipt" | "meter";

export type TwoPhotoScanSheetProps = {
  /** 閉じる（× / Escape / 背景 / 「キャンセル」）。選んだ画像は捨てる */
  onClose: () => void;
  /**
   * 「2枚を読み取る」（meter あり）/「メーターなしで読み取る」（meter = null）。
   * 圧縮・解析は呼び出し側（useScanPipeline の processImagePair）。シートは呼び出し側が閉じる
   */
  onSubmit: (receipt: File, meter: File | null) => void;
  /** 選択中の車両の距離の入力方式（メーターの撮り方の案内を切り替える） */
  distanceMode: DistanceMode;
  /** 最初から選んでおく画像（PC で 2 枚をドロップしたとき。1 枚目をレシート候補にする） */
  initialFiles?: { receipt: File | null; meter: File | null };
};

const BUTTON =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY = `${BUTTON} border border-border bg-surface text-ink hover:bg-surface-2`;

const ROLE_TEXT: Record<PairRole, { step: string; title: string; alt: string }> = {
  receipt: { step: "1", title: "レシート", alt: "レシートの画像" },
  meter: { step: "2", title: "メーター", alt: "メーターの画像" },
};

/** 選んだファイルのサムネイル（data URL）。読み込みは非同期（読めなければ null のまま。送信には影響しない） */
function useFileThumbnail(file: File | null): string | null {
  const [thumb, setThumb] = useState<{ file: File; url: string } | null>(null);
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    readAsDataUrl(file).then(
      (url) => {
        if (!cancelled) setThumb({ file, url });
      },
      (error: unknown) => console.error(error)
    );
    return () => {
      cancelled = true;
    };
  }, [file]);
  return thumb && thumb.file === file ? thumb.url : null;
}

type SlotProps = {
  role: PairRole;
  file: File | null;
  /** 次に選ぶ段階（強調し、aria-current="step" を付ける） */
  current: boolean;
  hint: string;
  onCamera: () => void;
  onAlbum: () => void;
  onRemove?: () => void;
  cameraButtonRef?: Ref<HTMLButtonElement>;
};

function PhotoSlot({ role, file, current, hint, onCamera, onAlbum, onRemove, cameraButtonRef }: SlotProps) {
  const headingId = useId();
  const thumb = useFileThumbnail(file);
  const text = ROLE_TEXT[role];
  const Icon = role === "receipt" ? Receipt : Gauge;
  return (
    <section
      aria-labelledby={headingId}
      aria-current={current ? "step" : undefined}
      className={`flex gap-3 rounded-2xl border p-3 ${current ? "border-accent/60 bg-accent-strong/10" : "border-line bg-surface"}`}
    >
      {file && thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb} alt={text.alt} className="h-16 w-16 shrink-0 rounded-xl bg-surface-2 object-cover" draggable={false} />
      ) : (
        <div
          className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-xl ${file ? "bg-surface-2" : "border border-dashed border-border bg-surface-2/50"}`}
        >
          <Icon className="h-6 w-6 text-faint" aria-hidden="true" />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 id={headingId} className="text-[15px] font-bold text-ink">
              {text.step}. {text.title}
              <span className={`ml-2 text-xs font-medium ${file ? "text-accent" : "text-sub"}`}>{file ? "選択済み" : "未選択"}</span>
            </h3>
            <p className="text-xs leading-relaxed text-sub">{hint}</p>
          </div>
          {file && onRemove && (
            <button
              type="button"
              onClick={onRemove}
              aria-label={`${text.title}の画像を外す`}
              className="-m-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sub hover:bg-surface-2 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            ref={cameraButtonRef}
            type="button"
            onClick={onCamera}
            aria-label={`${text.title}を${file ? "撮り直す" : "撮影"}`}
            className={SECONDARY}
          >
            <Camera className="h-4 w-4" aria-hidden="true" /> {file ? "撮り直す" : "撮影"}
          </button>
          <button
            type="button"
            onClick={onAlbum}
            aria-label={`${text.title}を${file ? "選び直す" : "アルバムから選ぶ"}`}
            className={SECONDARY}
          >
            <ImageIcon className="h-4 w-4" aria-hidden="true" /> {file ? "選び直す" : "アルバム"}
          </button>
        </div>
      </div>
    </section>
  );
}

/**
 * レシートとメーターを別々に撮る（2 枚で読み取る）シート。
 * 1. レシートを撮影・選択 → 2. メーターを撮影・選択 → 「2枚を読み取る」で 1 回の解析に送る（確認シートは従来どおり）。
 * - それぞれ撮り直し・選び直しができ、2 枚そろったら「入れ替える」で役割を入れ替えられる（ドロップした順が逆だったとき）
 * - メーターが無いときは「メーターなしで読み取る」でレシートだけを従来の 1 枚と同じ形で送る（距離は確認シートで入力）
 * - ファイル選択は各ボタンのタップの中で開く（非表示の入力を 1 組だけ持ち、どちらの役割かを ref に覚えておく）
 * 圧縮・送信は呼び出し側（useScanPipeline の processImagePair）。
 */
export default function TwoPhotoScanSheet({ onClose, onSubmit, distanceMode, initialFiles }: TwoPhotoScanSheetProps) {
  const [receipt, setReceipt] = useState<File | null>(initialFiles?.receipt ?? null);
  const [meter, setMeter] = useState<File | null>(initialFiles?.meter ?? null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const albumInputRef = useRef<HTMLInputElement>(null);
  const receiptCameraRef = useRef<HTMLButtonElement>(null);
  const meterCameraRef = useRef<HTMLButtonElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  // 画像を選んだ後に次の段階へフォーカスを移す（「2枚を読み取る」は再描画で押せるようになってから）。
  // ファイル選択のダイアログが閉じるとブラウザが元の要素へフォーカスを戻すことがあるので、その後に移す
  const pendingFocus = useRef<"meter" | "submit" | null>(null);
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    const id = setTimeout(() => (target === "meter" ? meterCameraRef : submitRef).current?.focus(), 0);
    return () => clearTimeout(id);
  });
  // 次に選ばれたファイルをどちらの役割に入れるか（ファイル選択を開く直前に設定する）
  const targetRole = useRef<PairRole>("receipt");
  const titleId = useId();

  const open = (role: PairRole, input: HTMLInputElement | null) => {
    targetRole.current = role;
    input?.click();
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    // 入力欄にフォーカスが残るとズームが戻らないことがあるので外す
    (document.activeElement as HTMLElement | null)?.blur?.();
    if (!file) return;
    if (!file.type.startsWith("image/")) return; // accept="image/*" なので通常は来ない
    if (targetRole.current === "receipt") {
      setReceipt(file);
      // 次の段階（メーター）へフォーカスを移す。メーターも選び済みなら「2枚を読み取る」へ
      pendingFocus.current = meter ? "submit" : "meter";
    } else {
      setMeter(file);
      if (receipt) pendingFocus.current = "submit";
    }
  };

  const swap = () => {
    setReceipt(meter);
    setMeter(receipt);
  };

  const meterHint =
    distanceMode === "odometer"
      ? "オドメーター（積算距離）が写るように撮影してください"
      : "トリップメーター（前回給油からの区間距離）が写るように撮影してください";
  const currentStep: PairRole | null = !receipt ? "receipt" : !meter ? "meter" : null;

  return (
    <Modal
      open
      onClose={onClose}
      title="レシートとメーターを別々に撮る"
      labelledBy={titleId}
      initialFocusRef={initialFiles?.receipt && initialFiles.meter ? submitRef : receiptCameraRef}
      lockBodyScroll
      backdropClassName="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
      panelClassName="w-full max-w-lg max-h-[92dvh] sm:max-h-[92vh] overflow-y-auto rounded-t-hero sm:rounded-hero border border-line bg-ground text-ink shadow-2xl shadow-black/50"
    >
      <div className="space-y-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-5">
        <div className="mx-auto -mt-1 h-1 w-10 rounded-full bg-border sm:hidden" aria-hidden="true" />
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-bold text-ink">
              レシートとメーターを別々に撮る
            </h2>
            <p className="mt-0.5 text-xs leading-relaxed text-sub">
              1枚目にレシート、2枚目にメーターを撮影または選択してください。2枚をまとめて読み取ります。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="-m-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sub hover:bg-surface-2 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <PhotoSlot
            role="receipt"
            file={receipt}
            current={currentStep === "receipt"}
            hint="日付・給油量・金額が読めるように撮影してください"
            onCamera={() => open("receipt", cameraInputRef.current)}
            onAlbum={() => open("receipt", albumInputRef.current)}
            cameraButtonRef={receiptCameraRef}
          />
          {receipt && meter && (
            <button type="button" onClick={swap} className={`${BUTTON} self-center text-sub hover:bg-surface-2 hover:text-ink`}>
              <ArrowUpDown className="h-4 w-4" aria-hidden="true" /> レシートとメーターを入れ替える
            </button>
          )}
          <PhotoSlot
            role="meter"
            file={meter}
            current={currentStep === "meter"}
            hint={meterHint}
            onCamera={() => open("meter", cameraInputRef.current)}
            onAlbum={() => open("meter", albumInputRef.current)}
            onRemove={() => setMeter(null)}
            cameraButtonRef={meterCameraRef}
          />
        </div>

        <div className="flex flex-col gap-2">
          <button
            ref={submitRef}
            type="button"
            disabled={!receipt || !meter}
            onClick={() => receipt && meter && onSubmit(receipt, meter)}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-scan-gradient px-4 text-[15px] font-bold text-white transition-transform active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-ground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ScanLine className="h-5 w-5" aria-hidden="true" /> 2枚を読み取る
          </button>
          {receipt && !meter && (
            <button type="button" onClick={() => onSubmit(receipt, null)} className={`${SECONDARY} w-full`}>
              メーターなしで読み取る
            </button>
          )}
          {receipt && !meter && (
            <p className="px-1 text-xs leading-relaxed text-sub">
              メーターなしで読み取ると、レシートだけを読み取ります。距離は確認画面で入力してください。
            </p>
          )}
          <button type="button" onClick={onClose} className={`${BUTTON} w-full text-sub hover:bg-surface-2 hover:text-ink`}>
            キャンセル
          </button>
        </div>
      </div>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden text-base"
        ref={cameraInputRef}
        onChange={handleFileChange}
        aria-label="カメラで撮影（2枚で読み取る）"
      />
      <input
        type="file"
        accept="image/*"
        className="hidden text-base"
        ref={albumInputRef}
        onChange={handleFileChange}
        aria-label="画像ファイルを選択（2枚で読み取る）"
      />
    </Modal>
  );
}
