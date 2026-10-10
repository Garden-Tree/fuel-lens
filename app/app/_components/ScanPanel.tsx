"use client";

import { useImperativeHandle, useRef, type ChangeEvent, type ReactNode, type Ref } from "react";
import { Camera, Edit2, Loader2, ScanLine, X } from "lucide-react";
import { IconButton } from "@/components/ui";
import type { ScanLoadingStep } from "@/lib/scan/useScanPipeline";

export type ScanPanelHandle = {
  /** カメラ（capture 付きのファイル入力）を開く（スキャンメニュー「撮影する」・PWA ショートカット「スキャン」・ホームの「撮影する」） */
  openCamera: () => void;
  /** ファイル選択（アルバム）を開く。capture なしの入力を使う */
  openAlbum: () => void;
};

export type ScanPanelProps = {
  ref?: Ref<ScanPanelHandle>;
  /** スキャン（圧縮・解析）中 */
  scanning: boolean;
  loadingStep: ScanLoadingStep;
  /** プレビュー中の画像（data URL） */
  preview: string | null;
  /** 共有で受け取り、確認ダイアログで読み取らなかった画像（「読み取る」「手動で入力」を出す） */
  sharedPending: string | null;
  readOnly: boolean;
  /** カメラ・アルバムで画像が選ばれたとき */
  onSelectFile: (file: File) => void;
  onClearPreview: () => void;
  onAnalyzeShared: (dataUrl: string) => void;
  onManualEntry: () => void;
  /** 解析を中断する（useScanPipeline の abort）。渡せば解析中のカードに「キャンセル」を出す */
  onCancelScan?: () => void;
};

const SMALL_BUTTON =
  "inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50";

function Thumbnail({ src }: { src: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="読み取る画像のプレビュー"
      className="h-16 w-16 shrink-0 rounded-xl bg-surface-2 object-cover"
      draggable="false"
    />
  );
}

function StatusCard({ children, live = false }: { children: ReactNode; live?: boolean }) {
  return (
    <div
      role={live ? "status" : undefined}
      aria-live={live ? "polite" : undefined}
      className="flex w-full items-center gap-3 rounded-hero border border-line bg-surface p-3 lg:p-4"
    >
      {children}
    </div>
  );
}

/**
 * ホームのスキャンの状態カードと、非表示のファイル入力（カメラ / アルバム）。
 * - 解析中: 段階（圧縮中 / 解析中）とキャンセル
 * - プレビュー中: 「次を撮る」・閉じる。共有で受け取った画像なら「読み取る」「手動で入力」
 * - どちらでもなければ何も描画しない（入力だけ）。撮影・アルバムは ref の openCamera / openAlbum で開く
 */
export default function ScanPanel({
  ref,
  scanning,
  loadingStep,
  preview,
  sharedPending,
  readOnly,
  onSelectFile,
  onClearPreview,
  onAnalyzeShared,
  onManualEntry,
  onCancelScan,
}: ScanPanelProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(
    ref,
    () => ({
      openCamera: () => cameraInputRef.current?.click(),
      openAlbum: () => galleryInputRef.current?.click(),
    }),
    []
  );

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    onSelectFile(file);
  };

  let card: ReactNode = null;
  if (scanning) {
    card = (
      <StatusCard live>
        {preview && <Thumbnail src={preview} />}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="flex items-center gap-2 text-[15px] font-bold text-ink">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent" aria-hidden="true" />
            {loadingStep === "compress" ? "画像を圧縮中..." : "AIが解析中..."}
          </p>
          <p className="truncate text-xs text-sub">
            {loadingStep === "compress" ? "送信のために画像を小さくしています" : "レシートとメーターの数値を読み取っています"}
          </p>
        </div>
        {onCancelScan && (
          <button
            type="button"
            onClick={onCancelScan}
            className={`${SMALL_BUTTON} shrink-0 border border-border bg-surface text-ink hover:bg-surface-2`}
          >
            キャンセル
          </button>
        )}
      </StatusCard>
    );
  } else if (preview) {
    card = (
      <StatusCard>
        <Thumbnail src={preview} />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="truncate text-[15px] font-medium text-ink">{sharedPending ? "共有された画像" : "読み取った画像"}</p>
          <div className="flex flex-wrap gap-2">
            {/* 共有で受け取り、確認ダイアログで読み取らなかった画像 */}
            {sharedPending && (
              <>
                <button
                  type="button"
                  onClick={() => onAnalyzeShared(sharedPending)}
                  className={`${SMALL_BUTTON} bg-accent-strong font-bold text-ink hover:bg-accent-strong/80`}
                >
                  <ScanLine className="h-4 w-4" aria-hidden="true" /> 読み取る
                </button>
                <button
                  type="button"
                  onClick={onManualEntry}
                  disabled={readOnly}
                  className={`${SMALL_BUTTON} border border-border bg-surface text-ink hover:bg-surface-2`}
                >
                  <Edit2 className="h-4 w-4" aria-hidden="true" /> 手動で入力
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className={`${SMALL_BUTTON} border border-border bg-surface text-ink hover:bg-surface-2`}
            >
              <Camera className="h-4 w-4" aria-hidden="true" /> 次を撮る
            </button>
          </div>
        </div>
        <IconButton variant="ghost" aria-label="プレビューを閉じる" onClick={onClearPreview} className="self-start">
          <X className="h-5 w-5" aria-hidden="true" />
        </IconButton>
      </StatusCard>
    );
  }

  return (
    <>
      {card}
      <input type="file" accept="image/*" capture="environment" className="hidden" ref={cameraInputRef} onChange={handleFileChange} aria-label="カメラで撮影" />
      <input type="file" accept="image/*" className="hidden" ref={galleryInputRef} onChange={handleFileChange} aria-label="画像ファイルを選択" />
    </>
  );
}
