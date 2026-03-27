"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, TrendingUp } from "lucide-react";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend
} from "recharts";

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

export default function StatsPage() {
  const [records, setRecords] = useState<FuelRecord[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem("fuel_lens_data");
    if (saved) {
      // 古い順にソートする（過去→現在）
      const parsed: FuelRecord[] = JSON.parse(saved);
      const sorted = parsed.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      // 不完全なデータをフィルタリングするかどうか検討しますが
      // 描画するために一旦表示可能なものだけフィルターする
      const validRecords = sorted.filter(r => r.fuel_efficiency !== null || r.total_cost !== null);
      
      setRecords(validRecords);
    }
  }, []);

  // グラフ用データ
  const data = records.map((r, i) => ({
    name: r.date || `Record ${i+1}`,
    efficiency: r.fuel_efficiency || 0,
    cost: r.total_cost || 0,
    gasStation: r.gas_station || "不明",
  }));

  // カスタムツールチップ (燃費)
  const CustomEfficiencyTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-gray-800 p-3 rounded-lg border border-gray-700 shadow-xl opacity-95">
          <p className="text-gray-400 text-xs mb-1">{label}</p>
          <p className="font-mono text-xl text-blue-400 font-bold">{payload[0].value.toFixed(2)} km/L</p>
          <p className="text-xs text-gray-500 mt-1 truncate max-w-[150px]">{data.gasStation}</p>
        </div>
      );
    }
    return null;
  };

  // カスタムツールチップ (コスト)
  const CustomCostTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-gray-800 p-3 rounded-lg border border-gray-700 shadow-xl opacity-95">
          <p className="text-gray-400 text-xs mb-1">{label}</p>
          <p className="font-mono text-xl text-green-400 font-bold">¥{payload[0].value.toLocaleString()}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <main className="min-h-screen bg-black text-white p-4 md:p-8 pb-20 font-sans flex flex-col items-center">
      <div className="w-full max-w-5xl">
      
        {/* ヘッダー */}
        <header className="flex items-center gap-4 py-4 mb-6 md:mb-10 sticky top-0 bg-black/80 backdrop-blur-md z-10 w-full">
          <Link href="/" className="p-2 bg-gray-900 rounded-full hover:bg-gray-800 transition">
            <ArrowLeft className="w-5 h-5 text-gray-300" />
          </Link>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-blue-500" /> 統計・推移
          </h1>
        </header>

        {records.length < 2 ? (
          <div className="text-center py-20 text-gray-600">
            <TrendingUp className="w-12 h-12 text-gray-800 mx-auto mb-4" />
            <p>グラフを表示するには、少なくとも2件以上の記録が必要です。</p>
          </div>
        ) : (
          <div className="space-y-8 animate-in fade-in duration-700">
            
            {/* 燃費グラフ */}
            <div className="bg-gray-900/50 border border-gray-800 rounded-3xl p-5 md:p-8">
              <h2 className="text-lg font-bold text-gray-300 mb-6 flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-blue-500 shadow-[0_0_10px_#3b82f6]"></span>
                燃費の推移 (km/L)
              </h2>
              <div className="h-64 md:h-80 w-full relative">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorEfficiency" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" vertical={false} />
                    <XAxis 
                      dataKey="name" 
                      stroke="#4a5568" 
                      fontSize={11} 
                      tickMargin={10} 
                      tickFormatter={(val) => {
                        // "YYYY-MM-DD" を "M/D" に変換するような簡易フォーマット
                        const parts = val.split('-');
                        if(parts.length >= 3) return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
                        return val;
                      }}
                    />
                    <YAxis 
                      stroke="#4a5568" 
                      fontSize={11} 
                      tickMargin={10} 
                      domain={['auto', 'auto']}
                    />
                    <Tooltip content={<CustomEfficiencyTooltip />} cursor={{ stroke: '#4a5568', strokeWidth: 1, strokeDasharray: '3 3' }} />
                    <Line 
                      type="monotone" 
                      dataKey="efficiency" 
                      stroke="#3b82f6" 
                      strokeWidth={4} 
                      dot={{ r: 5, fill: '#1e3a8a', stroke: '#3b82f6', strokeWidth: 2 }} 
                      activeDot={{ r: 7, fill: '#60a5fa', stroke: '#fff', strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 支払総額グラフ */}
            <div className="bg-gray-900/50 border border-gray-800 rounded-3xl p-5 md:p-8">
              <h2 className="text-lg font-bold text-gray-300 mb-6 flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-green-500 shadow-[0_0_10px_#22c55e]"></span>
                支払総額の推移 (円)
              </h2>
              <div className="h-64 w-full relative">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" vertical={false} />
                    <XAxis 
                      dataKey="name" 
                      stroke="#4a5568" 
                      fontSize={11} 
                      tickMargin={10}
                      tickFormatter={(val) => {
                        const parts = val.split('-');
                        if(parts.length >= 3) return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
                        return val;
                      }}
                    />
                    <YAxis 
                      stroke="#4a5568" 
                      fontSize={11} 
                      tickMargin={10} 
                      tickFormatter={(val) => `¥${val.toLocaleString()}`}
                    />
                    <Tooltip content={<CustomCostTooltip />} cursor={{ fill: '#1f2937' }} />
                    <Bar 
                      dataKey="cost" 
                      fill="#22c55e" 
                      radius={[4, 4, 0, 0]} 
                      barSize={30}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>
        )}
      </div>
    </main>
  );
}
