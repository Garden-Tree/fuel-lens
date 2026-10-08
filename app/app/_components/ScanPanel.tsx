"use client";

import { useImperativeHandle, useRef, type ChangeEvent, type Ref } from "react";
import { Calculator, Camera, Edit2, Image as ImageIcon, Loader2, X } from "lucide-react";
import type { DropZoneProps } from "@/lib/scan/useImageDropPaste";
import type { ScanLoadingStep } from "@/lib/scan/useScanPipeline";
import type { DistanceMode } from "@/lib/types";

export type ScanPanelHandle = {
  /**
   * カメラ / ファイル選択を開く（PWA ショートカット「スキャン」）。
   * ユーザー操作なしの呼び出しはブラウザにブロックされうるため、カメラボタンへフォーカスして押しやすくする
   */
  openCamera: () => void;
};

export type ScanPanelProps = {
  ref?: Ref<ScanPanelHandle>;
  /** 車両・記録の読み込み中（スケルトンを表示する） */
  dataLoading: boolean;
  /** スキャン（圧縮・解析）中 */
  scanning: boolean;
  loadingStep: ScanLoadingStep;
  /** プレビュー中の画像（data URL） */
  preview: string | null;
  /** 共有で受け取り、確認ダイアログで読み取らなかった画像（「読み取る」「手動で入力」を出す） */
  sharedPending: string | null;
  /** 「対象: ○○」に出す車両名 */
  vehicleName: string;
  distanceMode: DistanceMode;
  readOnly: boolean;
  /** 「AIスキャンはログイン後に利用できます」のヒントを出すか */
  showSignInHint: boolean;
  /** ドラッグ中（ドロップ先の強調表示） */
  isDragging?: boolean;
  dropZoneProps?: DropZoneProps;
  /** カメラ・アルバムで画像が選ばれたとき */
  onSelectFile: (file: File) => void;
  onClearPreview: () => void;
  onAnalyzeShared: (dataUrl: string) => void;
  onManualEntry: () => void;
};

/**
 * メイン画面左カラムのスキャン操作（カメラボタン・アルバム / 手動入力・ヒント・プレビュー・ドロップ先）と、
 * 非表示のファイル入力（カメラ / アルバム）。読み込み中はスケルトンを表示する。
 */
export default function ScanPanel({
  ref,
  dataLoading,
  scanning,
  loadingStep,
  preview,
  sharedPending,
  vehicleName,
  distanceMode,
  readOnly,
  showSignInHint,
  isDragging = false,
  dropZoneProps,
  onSelectFile,
  onClearPreview,
  onAnalyzeShared,
  onManualEntry,
}: ScanPanelProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraButtonRef = useRef<HTMLButtonElement>(null);

  useImperativeHandle(ref, () => ({
    openCamera: () => {
      const button = cameraButtonRef.current;
      if (button) {
        button.scrollIntoView({ block: "center" });
        button.focus({ preventScroll: true });
      }
      cameraInputRef.current?.click();
    },
  }), []);

  const openCamera = () => cameraInputRef.current?.click();

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    onSelectFile(file);
  };

  return (
    <>
      {dataLoading ? (
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
          {...dropZoneProps}
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

          {scanning && (
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
                {!scanning && (
                  <button
                    type="button"
                    onClick={onClearPreview}
                    aria-label="プレビューを閉じる"
                    className="absolute top-3 right-3 p-2.5 bg-black/50 rounded-full text-white backdrop-blur hover:bg-black/70 transition pointer-events-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                  >
                    <X className="w-5 h-5" aria-hidden="true" />
                  </button>
                )}
                {!scanning && (
                  <div className="absolute bottom-3 left-3 right-3 flex flex-wrap justify-end gap-2">
                    {/* 共有で受け取り、確認ダイアログで読み取らなかった画像 */}
                    {sharedPending && (
                      <>
                        <button
                          type="button"
                          onClick={() => onAnalyzeShared(sharedPending)}
                          className="bg-emerald-600/90 hover:bg-emerald-500 text-white text-xs font-bold py-2 px-4 min-h-10 rounded-full shadow-lg backdrop-blur flex items-center gap-2 pointer-events-auto"
                        >
                          <Calculator className="w-3 h-3" aria-hidden="true" /> 読み取る
                        </button>
                        <button
                          type="button"
                          onClick={onManualEntry}
                          disabled={readOnly}
                          className="bg-gray-800/90 hover:bg-gray-700 text-white text-xs font-bold py-2 px-4 min-h-10 rounded-full shadow-lg backdrop-blur flex items-center gap-2 pointer-events-auto disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Edit2 className="w-3 h-3" aria-hidden="true" /> 手動で入力
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={openCamera}
                      className="bg-blue-600/90 hover:bg-blue-500 text-white text-xs font-bold py-2 px-4 min-h-10 rounded-full shadow-lg backdrop-blur flex items-center gap-2 pointer-events-auto"
                    >
                      <Camera className="w-3 h-3" aria-hidden="true" /> 次を撮る
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-5 sm:p-6 flex flex-col items-center gap-5 sm:gap-6">
                <div className="text-center space-y-1">
                  <h2 className="text-lg font-semibold text-white">スキャンして記録</h2>
                  <p className="text-xs text-blue-400 font-semibold">対象: {vehicleName}</p>
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
                  onClick={openCamera}
                  disabled={scanning}
                  aria-label="カメラで撮影してスキャン"
                  className="group relative w-24 h-24 rounded-full bg-gradient-to-b from-blue-500 to-blue-700 shadow-[0_0_40px_-10px_rgba(59,130,246,0.5)] flex items-center justify-center transition-transform active:scale-95 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300/60"
                >
                  <div className="absolute inset-0 rounded-full border-4 border-blue-400/30 group-hover:border-blue-400/50 transition-colors" />
                  <Camera className="w-10 h-10 text-white fill-blue-500" aria-hidden="true" />
                </button>

                <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 sm:gap-4">
                  <button
                    type="button"
                    onClick={() => galleryInputRef.current?.click()}
                    disabled={scanning}
                    className="flex items-center gap-2 text-sm text-gray-500 hover:text-blue-400 transition-colors py-2 px-3 sm:px-4 min-h-10 whitespace-nowrap rounded-full hover:bg-gray-800"
                  >
                    <ImageIcon className="w-4 h-4" aria-hidden="true" />
                    <span>アルバムから選択</span>
                  </button>
                  <button
                    type="button"
                    onClick={onManualEntry}
                    disabled={scanning || readOnly}
                    className="flex items-center gap-2 text-sm text-gray-500 hover:text-blue-400 transition-colors py-2 px-3 sm:px-4 min-h-10 whitespace-nowrap rounded-full hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Edit2 className="w-4 h-4" aria-hidden="true" />
                    <span>手動で入力</span>
                  </button>
                </div>

                {/* スマホでは貼り付けの操作をほぼ使わないため sm 以上でだけ案内する */}
                <p className="hidden sm:block text-xs text-gray-500">画像のペースト（Ctrl+V）にも対応</p>
                {showSignInHint && (
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
    </>
  );
}
