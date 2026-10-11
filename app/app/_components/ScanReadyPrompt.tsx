"use client";

import { useId } from "react";
import { Camera, Image as ImageIcon } from "lucide-react";

export type ScanReadyPromptProps = {
  /** カメラを開く（このカードのボタンのタップの中で呼ぶ） */
  onCamera: () => void;
  /** ファイル選択（アルバム）を開く */
  onAlbum: () => void;
  onDismiss: () => void;
};

const BUTTON =
  "inline-flex h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent";

/**
 * 他の画面のスキャンメニュー・PWA ショートカットから `/app?action=scan|album` で来たときに、ホームの上に出す案内。
 * 遷移後はタップの扱いが切れていてファイル選択が開かないことがある（ブラウザが黙って無視する）ため、
 * ここのボタンをもう一度押してもらう（ボタンのタップの中で開くので確実に開く）。
 * 画像を選んだ・スキャンが始まった・「閉じる」で消える（表示の制御は app/app/page.tsx）。
 */
export default function ScanReadyPrompt({ onCamera, onAlbum, onDismiss }: ScanReadyPromptProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex w-full flex-col gap-3 rounded-hero border border-accent/40 bg-surface p-4">
      <div className="flex flex-col gap-0.5">
        <h2 id={headingId} className="text-[15px] font-bold text-ink">
          撮影の準備ができました
        </h2>
        <p className="text-xs text-sub">カメラが開かないときは、下のボタンを押してください</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onCamera} className={`${BUTTON} bg-scan-gradient text-white`}>
          <Camera className="h-4 w-4" aria-hidden="true" />
          撮影する
        </button>
        <button type="button" onClick={onAlbum} className={`${BUTTON} border border-border bg-surface text-ink hover:bg-surface-2`}>
          <ImageIcon className="h-4 w-4" aria-hidden="true" />
          アルバムから選ぶ
        </button>
        <button type="button" onClick={onDismiss} className={`${BUTTON} text-sub hover:bg-surface-2 hover:text-ink`}>
          閉じる
        </button>
      </div>
    </section>
  );
}
