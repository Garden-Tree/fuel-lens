import { Calculator, MapPin } from "lucide-react";

/** 最新記録カードの読み込み中スケルトン */
export default function RecordCardSkeleton() {
  return (
    <div>
      <div className="flex items-center justify-between px-2 mb-2">
        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
          <Calculator className="w-4 h-4" /> Latest Record
        </h3>
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden w-full">
        <div className="flex justify-between items-start mb-6">
          <div>
            <div className="w-12 h-3 bg-gray-800 rounded animate-pulse mb-2" />
            <div className="flex items-baseline gap-1">
              <div className="w-24 h-9 bg-gray-800 rounded animate-pulse" />
              <span className="text-sm font-bold text-blue-500">km/L</span>
            </div>
          </div>
          <div className="text-right flex flex-col items-end">
            <div className="w-16 h-7 bg-gray-800 rounded animate-pulse mb-1" />
            <p className="text-xs text-gray-500">Total Cost</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 bg-black/20 rounded-xl p-4 border border-white/5">
          <div>
            <p className="text-[10px] text-gray-400 uppercase mb-2">給油量</p>
            <div className="w-12 h-5 bg-gray-800 rounded animate-pulse" />
          </div>
          <div>
            <p className="text-[10px] text-gray-400 uppercase mb-2">走行距離</p>
            <div className="w-16 h-5 bg-gray-800 rounded animate-pulse" />
          </div>
          <div className="col-span-2 flex items-center gap-2 pt-2 border-t border-white/5">
            <MapPin className="w-3 h-3 text-gray-500" />
            <div className="w-24 h-3 bg-gray-800 rounded animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}
