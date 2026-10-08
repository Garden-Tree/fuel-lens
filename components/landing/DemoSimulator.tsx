"use client";

import { useEffect, useRef, useState } from "react";
import {
  Camera,
  Sparkles,
  Loader2,
  CheckCircle2,
  RefreshCw,
  Calendar,
  MapPin,
  ShieldAlert,
} from "lucide-react";

type DemoState = "idle" | "scanning" | "result";

/** デモの「解析中」表示を見せる時間（ms） */
const SCAN_DURATION_MS = 2000;

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
    <div className="bg-gray-900/60 border border-gray-800 rounded-3xl p-4 sm:p-6 md:p-8 shadow-2xl relative overflow-hidden backdrop-blur-xl">
      {demoState === "idle" && (
        <div className="space-y-8 py-6 flex flex-col items-center">
          <div className="flex items-center justify-center w-full max-w-xl">
            {/* メーターとレシートが1枚に収まったダミーの写真イメージ */}
            <div className="w-full bg-gray-900/50 border border-gray-800 rounded-2xl pt-16 pb-6 px-4 sm:px-6 flex flex-col sm:flex-row items-center gap-8 shadow-xl relative overflow-hidden">
              <div className="absolute inset-0 bg-blue-500/5 pointer-events-none" />

              {/* レシート部分 */}
              <div className="w-44 bg-white text-black p-4 rounded shadow font-mono text-xs border border-gray-200 scale-95 flex-shrink-0">
                <div className="text-center border-b border-dashed border-gray-300 pb-2">
                  <p className="font-sans font-bold text-sm leading-tight">ENEOS 新宿南口SS</p>
                  <p className="font-sans text-[10px] text-gray-500">2026-05-21 18:45</p>
                </div>
                <div className="py-2.5 space-y-1.5">
                  <div className="flex justify-between">
                    <span>レギュラー</span>
                    <span>35.48 L</span>
                  </div>
                  <div className="flex justify-between font-bold text-sm pt-1.5 border-t border-gray-200">
                    <span>合計金額</span>
                    <span>¥5,500</span>
                  </div>
                </div>
              </div>

              {/* メーター部分（トリップメーター） */}
              <div className="flex-1 w-full bg-gray-950 border-2 border-gray-800 p-4 rounded-xl shadow-inner text-center flex flex-col justify-center">
                <div className="w-full h-14 bg-black border border-gray-800 rounded flex items-center justify-center font-mono text-2xl sm:text-3xl text-amber-500 tracking-widest relative px-4">
                  <span className="absolute left-2.5 text-xs text-gray-500 uppercase font-sans font-bold">Trip</span>
                  0548.0<span className="text-xs text-gray-500 self-end mb-0.5 ml-1">km</span>
                </div>
              </div>

              {/* カメラファインダー風の装飾線 */}
              <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-blue-500" />
              <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-blue-500" />
              <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-blue-500" />
              <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-blue-500" />

              <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[11px] sm:text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5 whitespace-nowrap">
                <Camera className="w-3.5 h-3.5" />
                <span>レシート＆トリップメーター同時撮影写真 (1枚)</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={startDemoScan}
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-6 sm:px-8 py-4 rounded-full transition shadow-lg shadow-blue-500/20 active:scale-95 flex items-center justify-center gap-2 text-base w-full sm:w-auto"
          >
            <Sparkles className="w-5 h-5" />
            <span>デモ写真を解析する（シミュレート）</span>
          </button>
        </div>
      )}

      {demoState === "scanning" && (
        <div className="py-20 flex flex-col items-center justify-center space-y-6">
          <div className="relative">
            <Loader2 className="w-16 h-16 text-blue-500 animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Camera className="w-6 h-6 text-blue-400" />
            </div>
          </div>

          <div className="text-center space-y-2">
            <p className="text-xl font-bold text-white animate-pulse">
              AIが1枚の写真からレシートとメーターを同時にスキャン中...
            </p>
            <p className="text-sm text-gray-500">Gemini AI モデルが画像解析を実行しています</p>
          </div>
        </div>
      )}

      {demoState === "result" && (
        <div className="space-y-6 py-2 animate-in fade-in zoom-in-95 duration-500">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-white/5 pb-4">
            <h3 className="text-lg font-bold text-green-400 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" /> AI解析完了（以下のように読み取り結果が表示されます）
            </h3>
            <button
              type="button"
              onClick={resetDemo}
              className="text-sm text-gray-400 hover:text-white flex items-center gap-1.5 px-3 py-2 min-h-10 shrink-0 self-end sm:self-auto rounded-lg hover:bg-gray-800 transition"
            >
              <RefreshCw className="w-4 h-4" /> もう一度試す
            </button>
          </div>

          {/* 実アプリ (/app) のリザルトカードの構成・クラスを再現し、文字サイズを拡大 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            {/* アプリの最新リザルトカードの再現 */}
            <div className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-gray-800 to-gray-900 border-gray-700 p-5 sm:p-6 shadow-md">
              <div className="flex justify-between items-start gap-3 mb-6">
                <div>
                  <p className="text-xs text-gray-500 mb-1 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" /> 2026-05-21
                  </p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-white font-mono tracking-tighter">15.45</span>
                    <span className="text-sm font-bold text-blue-500">km/L</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl sm:text-3xl font-extrabold text-green-400 font-mono">¥5,500</p>
                  <p className="text-xs text-gray-500">Total Cost</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 bg-black/20 rounded-xl p-4 border border-white/5 text-sm">
                <div>
                  <p className="text-xs text-gray-400 uppercase">給油量</p>
                  <p className="text-xl font-mono font-bold text-blue-200">
                    35.48 <span className="text-xs text-gray-500">L</span>
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase">区間走行距離</p>
                  <p className="text-xl font-mono font-bold text-gray-200">
                    548.0 <span className="text-xs text-gray-500">km</span>
                  </p>
                </div>
                <div className="col-span-2 flex items-center gap-2 pt-2.5 border-t border-white/5 text-xs">
                  <MapPin className="w-4 h-4 text-gray-500" />
                  <p className="text-gray-400 truncate">ENEOS 新宿南口SS</p>
                </div>
              </div>
            </div>

            {/* 認識詳細 */}
            <div className="space-y-4">
              <h4 className="text-base font-bold text-gray-300">AIによる読取項目</h4>
              <ul className="space-y-3 text-sm sm:text-base text-gray-400">
                <li className="flex items-center gap-3 bg-gray-900/50 p-3 rounded-lg border border-white/5">
                  <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                  <span>
                    トリップメーター (区間走行距離): <strong className="text-white font-mono text-base">548.0 km</strong> を認識
                  </span>
                </li>
                <li className="flex items-center gap-3 bg-gray-900/50 p-3 rounded-lg border border-white/5">
                  <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                  <span>
                    給油量: <strong className="text-white font-mono text-base">35.48 L</strong> を認識
                  </span>
                </li>
                <li className="flex items-center gap-3 bg-gray-900/50 p-3 rounded-lg border border-white/5">
                  <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                  <span>
                    支払金額: <strong className="text-white font-mono text-base">¥5,500</strong> を認識
                  </span>
                </li>
                <li className="flex items-center gap-3 bg-gray-900/50 p-3 rounded-lg border border-white/5">
                  <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                  <span>
                    給油日: <strong className="text-white font-mono text-base">2026-05-21</strong> を認識
                  </span>
                </li>
                <li className="flex items-center gap-3 bg-gray-900/50 p-3 rounded-lg border border-white/5">
                  <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                  <span>
                    店舗名: <strong className="text-white font-sans text-sm">ENEOS 新宿南口SS</strong> を認識
                  </span>
                </li>
              </ul>
            </div>
          </div>

          <div className="bg-blue-500/5 border border-blue-500/10 rounded-2xl p-4 flex gap-3 items-start text-sm text-blue-300 leading-normal">
            <ShieldAlert className="w-6 h-6 flex-shrink-0 text-blue-400" />
            <p>
              実際のアプリでは、この読み取り結果を保存前に確認・修正したうえで記録できます。保存後は履歴一覧と推移グラフに反映され、あとから編集することも可能です。
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
