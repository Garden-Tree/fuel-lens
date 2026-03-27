"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Trash2, MapPin, Calendar, Fuel, BarChart3 } from "lucide-react";

// 型定義 (共通化していないので一旦ここにも書きます)
type FuelRecord = {
  id: string;
  date: string;
  total_distance: number | null;
  fuel_amount: number | null;
  gas_station: string | null;
  price_per_unit: number | null;
  total_cost: number | null;
  fuel_efficiency: number | null;
};

export default function HistoryPage() {
  const [records, setRecords] = useState<FuelRecord[]>([]);

  // ロード時にデータを取得
  useEffect(() => {
    const saved = localStorage.getItem("fuel_lens_data");
    if (saved) setRecords(JSON.parse(saved));
  }, []);

  // 削除機能
  const deleteRecord = (id: string) => {
    if (!confirm("この記録を削除しますか？")) return;
    
    const newRecords = records.filter(r => r.id !== id);
    setRecords(newRecords);
    localStorage.setItem("fuel_lens_data", JSON.stringify(newRecords));
  };

  return (
    <main className="min-h-screen bg-black text-white p-4 md:p-8 pb-20 font-sans flex flex-col items-center">
      <div className="w-full max-w-5xl">

      {/* ヘッダー */}
      <header className="flex items-center justify-between py-4 mb-6 md:mb-10 sticky top-0 bg-black/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-4">
          <Link href="/" className="p-2 bg-gray-900 rounded-full hover:bg-gray-800 transition">
            <ArrowLeft className="w-5 h-5 text-gray-300" />
          </Link>
          <h1 className="text-xl md:text-2xl font-bold">給油履歴</h1>
        </div>
        
        <Link href="/stats" className="p-2 bg-gray-900 rounded-full hover:bg-gray-800 transition text-gray-300 group flex items-center gap-2">
          <span className="hidden sm:inline text-sm font-bold pr-1">グラフを見る</span>
          <BarChart3 className="w-5 h-5 text-blue-400" />
        </Link>
      </header>

      {/* リスト表示 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {records.length === 0 ? (
          <div className="text-center py-20 text-gray-600 col-span-full">
            <p>履歴がありません</p>
          </div>
        ) : (
          records.map((rec) => (
            <div key={rec.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 relative group">
              
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                    <Calendar className="w-3 h-3" />
                    {rec.date || "日付不明"}
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className={`text-2xl font-bold font-mono ${rec.fuel_efficiency ? 'text-white' : 'text-gray-600'}`}>
                      {rec.fuel_efficiency ? rec.fuel_efficiency.toFixed(2) : "--.--"}
                    </span>
                    <span className="text-xs font-bold text-blue-500">km/L</span>
                  </div>
                </div>
                
                <div className="text-right">
                  <p className="text-lg font-bold text-green-400 font-mono">
                    ¥{rec.total_cost?.toLocaleString() || "---"}
                  </p>
                  <p className="text-[10px] text-gray-500">Total Cost</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm bg-black/20 p-3 rounded-lg">
                <div className="flex justify-between border-r border-gray-800 pr-2">
                    <span className="text-gray-500 text-xs">給油量</span>
                    <span className="font-mono text-gray-300">{rec.fuel_amount} L</span>
                </div>
                <div className="flex justify-between pl-2">
                    <span className="text-gray-500 text-xs">走行</span>
                    <span className="font-mono text-gray-300">{rec.total_distance} km</span>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
                <MapPin className="w-3 h-3" />
                <span className="truncate">{rec.gas_station || "SS不明"}</span>
              </div>

              {/* 削除ボタン (右上に配置) */}
              <button 
                onClick={() => deleteRecord(rec.id)}
                className="absolute top-4 right-4 p-2 text-gray-600 hover:text-red-500 transition opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>
      </div>
    </main>
  );
}