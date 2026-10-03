"use client";

import { useState } from "react";
import {
  Fuel,
  Camera,
  Calculator,
  BarChart3,
  History,
  ChevronRight,
  Car,
  Calendar,
  MapPin,
  ImageIcon,
  Plus,
} from "lucide-react";

type DemoVehicle = "prius" | "aqua";

/**
 * ヒーローセクション右側の「スマホ画面モック」。
 * 車両タブの切り替えだけがインタラクティブなので、この部分だけをクライアントコンポーネントにしている。
 */
export default function HeroPhonePreview() {
  const [selectedVehicle, setSelectedVehicle] = useState<DemoVehicle>("prius");
  const vehicleName = selectedVehicle === "prius" ? "プリウス" : "アクア";

  return (
    <div className="w-full max-w-[370px] bg-gray-950 border border-gray-800 rounded-[44px] p-3 shadow-2xl relative ring-8 ring-gray-950/80 overflow-hidden">
      {/* スピーカーとインカメラのノッチ */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 w-32 h-4 bg-black rounded-full z-20 flex items-center justify-center">
        <div className="w-2.5 h-2.5 rounded-full bg-gray-800 ml-auto mr-4" />
      </div>

      {/* アプリ画面の実コンポーネント再現UI */}
      <div className="w-full h-full bg-gradient-to-b from-gray-900 to-black rounded-[36px] p-4 pt-8 flex flex-col justify-between text-xs overflow-hidden select-none font-sans text-white">
        {/* アプリヘッダーコンポーネント */}
        <div className="flex justify-between items-center py-2 mb-2 border-b border-white/5">
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 bg-gradient-to-tr from-blue-600 to-cyan-400 rounded-md flex items-center justify-center shadow-inner">
              <Fuel className="text-white w-3.5 h-3.5 fill-current" />
            </div>
            <span className="font-extrabold text-sm tracking-tight text-white">FuelLens</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-gray-800/50 rounded-full border border-gray-700/50 text-gray-400">
              <BarChart3 className="w-3.5 h-3.5" />
            </div>
            <div className="p-1.5 bg-gray-800/50 rounded-full border border-gray-700/50 text-gray-400">
              <History className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>

        {/* 車両セレクターコンポーネント (VehicleSelector.tsx) の再現 */}
        <div className="w-full mb-4">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-gray-950/40 border border-gray-800/80 rounded-xl w-full">
              <button
                type="button"
                onClick={() => setSelectedVehicle("prius")}
                className={`flex items-center gap-1 py-1 px-3 rounded-lg font-bold text-[10px] transition-all duration-300 flex-1 justify-center ${
                  selectedVehicle === "prius"
                    ? "bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-md shadow-blue-950"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                <Car className="w-3 h-3 flex-shrink-0" />
                <span>プリウス</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedVehicle("aqua")}
                className={`flex items-center gap-1 py-1 px-3 rounded-lg font-bold text-[10px] transition-all duration-300 flex-1 justify-center ${
                  selectedVehicle === "aqua"
                    ? "bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-md shadow-blue-950"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                <Car className="w-3 h-3 flex-shrink-0" />
                <span>アクア</span>
              </button>
              <button
                type="button"
                aria-label="車両を追加（デモ）"
                className="flex items-center justify-center p-1 rounded-lg text-gray-500 border border-dashed border-gray-800"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        {/* 2カラムレイアウト（縦積み） */}
        <div className="space-y-4">
          {/* アクションエリア (app/app/page.tsx のスキャンカード) */}
          <div className="relative overflow-hidden bg-gray-800/40 backdrop-blur-xl border border-gray-700/50 rounded-2xl shadow-xl">
            <div className="p-4 flex flex-col items-center gap-3">
              <div className="text-center space-y-0.5">
                <h2 className="text-sm font-semibold text-white">スキャンして記録</h2>
                <p className="text-[10px] text-blue-400 font-semibold">対象: {vehicleName}</p>
                <p className="text-[10px] text-gray-400">レシートとトリップメーターを1枚に収めて撮影</p>
              </div>

              <div className="w-16 h-16 rounded-full bg-gradient-to-b from-blue-500 to-blue-700 shadow-md flex items-center justify-center border-4 border-blue-400/30">
                <Camera className="w-7 h-7 text-white fill-blue-500" />
              </div>

              <div className="flex items-center gap-1 text-[10px] text-gray-500">
                <ImageIcon className="w-3.5 h-3.5" />
                <span>アルバムから選択</span>
              </div>
            </div>
          </div>

          {/* 最新リザルトカード (app/app/page.tsx のLatest Recordカード) */}
          <div>
            <div className="flex items-center justify-between px-1 mb-1">
              <h3 className="text-[9px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                <Calculator className="w-3 h-3" /> Latest Record
              </h3>
            </div>

            <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-gray-800 to-gray-900 border-gray-700 p-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="text-[9px] text-gray-500 mb-0.5 flex items-center gap-1">
                    <Calendar className="w-2.5 h-2.5" /> 2026-05-21
                  </p>
                  <div className="flex items-baseline gap-0.5">
                    <span className="text-2xl font-bold text-white font-mono tracking-tighter">
                      {selectedVehicle === "prius" ? "22.45" : "19.80"}
                    </span>
                    <span className="text-[10px] font-bold text-blue-500">km/L</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-green-400 font-mono">
                    {selectedVehicle === "prius" ? "¥5,480" : "¥4,120"}
                  </p>
                  <p className="text-[9px] text-gray-500">Total Cost</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 bg-black/20 rounded-lg p-2.5 border border-white/5 text-[10px]">
                <div>
                  <p className="text-[8px] text-gray-400 uppercase">給油量</p>
                  <p className="font-mono font-bold text-blue-200">
                    {selectedVehicle === "prius" ? "35.40 L" : "28.50 L"}
                  </p>
                </div>
                <div>
                  <p className="text-[8px] text-gray-400 uppercase">走行距離</p>
                  <p className="font-mono font-bold text-gray-200">
                    {selectedVehicle === "prius" ? "795 km" : "564 km"}
                  </p>
                </div>
                <div className="col-span-2 flex items-center gap-1.5 pt-1.5 border-t border-white/5 text-[9px]">
                  <MapPin className="w-3 h-3 text-gray-500" />
                  <p className="text-gray-400 truncate">ENEOS 新宿SS</p>
                </div>
              </div>
            </div>
          </div>

          {/* 履歴へのリンクボタン (app/app/page.tsx の下部リンク) */}
          <div className="group flex items-center justify-between w-full p-3 rounded-xl bg-gray-900 border border-gray-800 text-[10px]">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-gray-800 rounded-lg">
                <History className="w-4 h-4 text-gray-400" />
              </div>
              <div className="text-left">
                <p className="font-bold text-gray-200">過去の記録を見る</p>
                <p className="text-[9px] text-gray-500">対象: {vehicleName}</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-500" />
          </div>
        </div>
      </div>
    </div>
  );
}
