"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Share2 } from "lucide-react";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { SHARE_URL, shareTextOf, xIntentUrlOf, type ShareCardModel } from "@/lib/share/card";
import { renderShareCardBlob } from "@/lib/share/drawCard";

type CardImage = { blob: Blob; url: string };

const PRIMARY =
  "flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-bold text-ground transition-colors hover:bg-[#5BB2FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-ground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-accent";
const SECONDARY =
  "flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-bold text-ink transition-colors hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent aria-disabled:pointer-events-none aria-disabled:opacity-40 disabled:cursor-not-allowed disabled:opacity-40";

/** X のロゴ（lucide に無いため単色の SVG） */
function XLogo() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function isAbortError(error: unknown): boolean {
  // DOMException は環境によって Error のインスタンスにならないので name だけで判定する
  return typeof error === "object" && error !== null && (error as { name?: unknown }).name === "AbortError";
}

/** 端末の共有シートでファイルを共有できるか（主にスマホ） */
function canShareFile(file: File | null): boolean {
  if (!file || typeof navigator === "undefined") return false;
  if (typeof navigator.share !== "function" || typeof navigator.canShare !== "function") return false;
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export type ShareCardModalProps = {
  model: ShareCardModel;
  onClose: () => void;
};

/**
 * シェアカードのプレビューと共有の操作（開いている間だけ描画する）。
 * 画像は開いたときにブラウザの canvas で作り（lib/share/drawCard.ts）、サーバーには送らない。
 * - 共有する: Web Share API（ファイルを共有できる端末だけ。主にスマホ）。キャンセル（AbortError）は何も言わない
 * - X に投稿: 投稿画面（intent）を新しいタブで開く。画像は添付できないので文言と URL だけ
 * - 画像を保存: PNG をダウンロードする
 */
export default function ShareCardModal({ model, onClose }: ShareCardModalProps) {
  const { toast } = useToast();
  const [image, setImage] = useState<CardImage | null>(null);
  const [failed, setFailed] = useState(false);
  const [sharing, setSharing] = useState(false);

  // 開いたら画像を作る
  useEffect(() => {
    let cancelled = false;
    renderShareCardBlob(model)
      .then(blob => {
        if (cancelled) return;
        setImage({ blob, url: URL.createObjectURL(blob) });
      })
      .catch(error => {
        if (cancelled) return;
        console.error("シェア画像の作成に失敗しました:", error);
        setFailed(true);
        toast("シェア画像を作成できませんでした", { type: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [model, toast]);

  // プレビューの URL は差し替え・閉じたときに解放する
  useEffect(() => {
    if (!image) return;
    return () => URL.revokeObjectURL(image.url);
  }, [image]);

  const text = shareTextOf(model);
  const file = useMemo(
    () => (image ? new File([image.blob], model.filename, { type: "image/png" }) : null),
    [image, model.filename]
  );
  const shareable = canShareFile(file);

  const share = async () => {
    if (!file || sharing) return;
    setSharing(true);
    try {
      await navigator.share({ files: [file], text, url: SHARE_URL });
      toast("共有しました", { type: "success" });
    } catch (error) {
      if (isAbortError(error)) return;
      console.error("共有に失敗しました:", error);
      toast("共有できませんでした。画像を保存してから投稿してください", { type: "error" });
    } finally {
      setSharing(false);
    }
  };

  const save = () => {
    if (!image) return;
    try {
      const url = URL.createObjectURL(image.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = model.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      // クリック直後に revoke すると一部ブラウザでダウンロードが始まらないため、少し遅らせる
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast("画像を保存しました", { type: "success" });
    } catch (error) {
      console.error("画像の保存に失敗しました:", error);
      toast("画像を保存できませんでした", { type: "error" });
    }
  };

  const alt = `FuelLens の燃費カード。${model.periodLabel}${model.vehicleName ? `・${model.vehicleName}` : ""}の燃費 ${model.efficiencyText} km/L、${model.statsLine}`;

  return (
    <Modal
      open
      onClose={onClose}
      title="燃費をシェア"
      lockBodyScroll
      // スマホ幅では下から出るシート、PC では中央のダイアログ（車両の管理と同じ）
      backdropClassName="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      panelClassName="relative w-full max-w-lg bg-ground border border-line rounded-t-hero sm:rounded-hero shadow-2xl shadow-black/50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-5 overflow-y-auto overscroll-contain max-h-[92dvh] sm:max-h-[90vh]"
    >
      <Modal.Header icon={<Share2 className="h-5 w-5 text-accent" aria-hidden="true" />} className="mb-4" />
      <Modal.Body>
        <div className="overflow-hidden rounded-xl border border-line bg-surface" style={{ aspectRatio: "1200 / 630" }}>
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element -- ブラウザで作った blob: の画像（next/image は使えない）
            <img src={image.url} alt={alt} width={1200} height={630} className="h-full w-full object-cover" />
          ) : (
            <div role="status" className="flex h-full w-full items-center justify-center text-sm text-sub">
              {failed ? "画像を作成できませんでした" : <span className="animate-pulse">画像を作成しています…</span>}
            </div>
          )}
        </div>
        <p className="mt-3 break-words text-[13px] leading-relaxed text-sub">{text}</p>
      </Modal.Body>
      <Modal.Footer className="mt-4 grid gap-2">
        {shareable && (
          <button type="button" className={PRIMARY} onClick={() => void share()} disabled={sharing}>
            <Share2 className="h-[18px] w-[18px]" aria-hidden="true" />
            共有する
          </button>
        )}
        <div className="grid grid-cols-2 gap-2">
          <a
            href={xIntentUrlOf(text)}
            target="_blank"
            rel="noopener noreferrer"
            className={SECONDARY}
          >
            <XLogo />
            X に投稿
          </a>
          <button type="button" className={SECONDARY} onClick={save} disabled={!image}>
            <Download className="h-[18px] w-[18px]" aria-hidden="true" />
            画像を保存
          </button>
        </div>
        {!shareable && image && (
          <p className="text-xs leading-relaxed text-sub">X の投稿画面には画像を添付できません。保存した画像を投稿に添えてください。</p>
        )}
      </Modal.Footer>
    </Modal>
  );
}
