"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Sparkles, Loader2, CheckCircle2, RefreshCw, ShieldAlert } from "lucide-react";
import { GroupedList, ValueRow } from "@/components/ui";

type DemoState = "idle" | "scanning" | "result";

/** デモの「解析中」表示を見せる時間（ms） */
const SCAN_DURATION_MS = 2000;

/** AI の読取項目（値は等幅数字で表示する） */
const RECOGNIZED_ITEMS: readonly { label: string; value: string; mono: boolean }[] = [
  { label: "トリップメーター（区間走行距離）", value: "548.0 km", mono: true },
  { label: "給油量", value: "35.48 L", mono: true },
  { label: "支払金額", value: "¥5,500", mono: true },
  { label: "給油日", value: "2026-05-21", mono: true },
  { label: "店舗名", value: "ENEOS 新宿南口SS", mono: false },
];

/**
 * ランディングページの体験デモ（スキャンシミュレーター）。
 * 実際の API は呼ばず、タイマーで「解析中 → 結果」を再現するだけ。
 */
export default function DemoSimulator() {
  const [demoState, setDemoState] = useState<DemoState>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // アンマウント時にタイマーを破棄する
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const startDemoScan = () => {
    setDemoState("scanning");
    timerRef.current = setTimeout(() => {
      setDemoState("result");
    }, SCAN_DURATION_MS);
  };

  const resetDemo = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setDemoState("idle");
  };

  return (
    <div className="relative overflow-hidden rounded-hero border border-line bg-surface p-4 shadow-2xl shadow-black/40 sm:p-6 md:p-8">
      {demoState === "idle" && (
        <div className="flex flex-col items-center space-y-8 py-6">
          <div className="flex w-full max-w-xl items-center justify-center">
            {/* メーターとレシートが1枚に収まったダミーの写真イメージ */}
            <div className="relative flex w-full flex-col items-center gap-8 overflow-hidden rounded-2xl border border-line bg-ground px-4 pb-6 pt-16 sm:flex-row sm:px-6">
              {/* レシート部分 */}
              <div className="num w-44 flex-shrink-0 scale-95 rounded border border-gray-200 bg-white p-4 text-xs text-black shadow">
                <div className="border-b border-dashed border-gray-300 pb-2 text-center">
                  <p className="font-sans text-sm font-bold leading-tight">ENEOS 新宿南口SS</p>
                  <p className="font-sans text-[10px] text-gray-500">2026-05-21 18:45</p>
                </div>
                <div className="space-y-1.5 py-2.5">
                  <div className="flex justify-between">
                    <span className="font-sans">レギュラー</span>
                    <span>35.48 L</span>
                  </div>
                  <div className="flex justify-between border-t border-gray-200 pt-1.5 text-sm font-bold">
                    <span className="font-sans">合計金額</span>
                    <span>¥5,500</span>
                  </div>
                </div>
              </div>

              {/* メーター部分（トリップメーター） */}
              <div className="flex w-full flex-1 flex-col justify-center rounded-xl border-2 border-border bg-surface p-4 text-center">
                <div className="num relative flex h-14 w-full items-center justify-center rounded border border-line bg-black px-4 text-2xl tracking-widest text-warn sm:text-3xl">
                  <span className="absolute left-2.5 font-sans text-xs font-bold text-sub">Trip</span>
                  0548.0<span className="mb-0.5 ml-1 self-end text-xs text-sub">km</span>
                </div>
              </div>

              {/* カメラファインダー風の装飾線 */}
              <div className="absolute left-2 top-2 h-4 w-4 border-l-2 border-t-2 border-accent" />
              <div className="absolute right-2 top-2 h-4 w-4 border-r-2 border-t-2 border-accent" />
              <div className="absolute bottom-2 left-2 h-4 w-4 border-b-2 border-l-2 border-accent" />
              <div className="absolute bottom-2 right-2 h-4 w-4 border-b-2 border-r-2 border-accent" />

              <div className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-accent-strong px-3 py-1 text-[11px] font-bold text-accent sm:text-xs">
                <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                <span>レシート＆トリップメーター同時撮影写真 (1枚)</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={startDemoScan}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-accent px-6 py-4 text-base font-bold text-ground transition hover:bg-[#5BB2FF] active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface sm:w-auto sm:px-8"
          >
            <Sparkles className="h-5 w-5" aria-hidden="true" />
            <span>デモ写真を解析する（シミュレート）</span>
          </button>
        </div>
      )}

      {demoState === "scanning" && (
        <div className="flex flex-col items-center justify-center space-y-6 py-20">
          <div className="relative">
            <Loader2 className="h-16 w-16 animate-spin text-accent" aria-hidden="true" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Camera className="h-6 w-6 text-accent" aria-hidden="true" />
            </div>
          </div>

          <div className="space-y-2 text-center" role="status">
            <p className="animate-pulse text-xl font-bold text-ink">
              AIが1枚の写真からレシートとメーターを同時にスキャン中...
            </p>
            <p className="text-sm text-sub">Gemini AI モデルが画像解析を実行しています</p>
          </div>
        </div>
      )}

      {demoState === "result" && (
        <div className="animate-in fade-in zoom-in-95 space-y-6 py-2 duration-500">
          <div className="flex flex-col items-start justify-between gap-2 border-b border-line pb-4 sm:flex-row sm:items-center">
            <h3 className="flex items-center gap-2 text-lg font-bold text-money">
              <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" /> AI解析完了（以下のように読み取り結果が表示されます）
            </h3>
            <button
              type="button"
              onClick={resetDemo}
              className="flex min-h-10 shrink-0 items-center gap-1.5 self-end rounded-lg px-3 py-2 text-sm text-sub transition hover:bg-surface-2 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:self-auto"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> もう一度試す
            </button>
          </div>

          <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2">
            {/* 実アプリの確認シート・ホームに近い、読み取り結果のカード */}
            <div className="space-y-3">
              <div className="rounded-2xl bg-ground p-5 text-center sm:p-6">
                <p className="text-xs text-sub">燃費（満タン法）</p>
                <p className="mt-1">
                  <span className="num text-5xl font-bold text-ink">15.45</span>
                  <span className="ml-1.5 text-sm text-sub">km/L</span>
                </p>
                <p className="mt-1 text-xs text-sub">
                  <span className="num">548.0</span> km ÷ <span className="num">35.48</span> L
                </p>
              </div>
              <GroupedList className="bg-ground">
                <ValueRow label="支払総額" value="¥5,500" tone="money" />
                <ValueRow label="給油量" value="35.48" unit=" L" />
                <ValueRow label="区間走行距離" value="548.0" unit=" km" />
                <ValueRow label="給油日" value="2026-05-21" />
                <div className="flex min-h-[46px] items-center justify-between gap-3 px-4 py-2">
                  <span className="text-[15px] text-ink">スタンド</span>
                  <span className="truncate text-[15px] text-sub">ENEOS 新宿南口SS</span>
                </div>
              </GroupedList>
            </div>

            {/* 認識詳細 */}
            <div className="space-y-4">
              <h4 className="text-base font-bold text-ink">AIによる読取項目</h4>
              <ul className="space-y-3 text-sm text-sub sm:text-base">
                {RECOGNIZED_ITEMS.map((item) => (
                  <li key={item.label} className="flex items-center gap-3 rounded-xl bg-ground p-3">
                    <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-money" aria-hidden="true" />
                    <span>
                      {item.label}:{" "}
                      <strong className={`${item.mono ? "num" : ""} text-base text-ink`}>{item.value}</strong> を認識
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-2xl bg-accent-strong/40 p-4 text-sm leading-normal text-accent">
            <ShieldAlert className="h-6 w-6 flex-shrink-0" aria-hidden="true" />
            <p>
              実際のアプリでは、この読み取り結果を保存前に確認・修正したうえで記録できます。保存後は履歴一覧と推移グラフに反映され、あとから編集することも可能です。
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
