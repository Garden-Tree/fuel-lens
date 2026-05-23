"use client";

import { useMemo } from "react";
import Link from "next/link";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import { ArrowLeft, TrendingUp, Loader2 } from "lucide-react";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar
} from "recharts";

import { useFuelRecords } from "@/lib/useFuelRecords";
import { useVehicles } from "@/lib/useVehicles";
import VehicleSelector from "@/components/VehicleSelector";

interface TooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
    payload: {
      name: string;
      efficiency: number;
      cost: number;
      gasStation: string;
    };
  }>;
  label?: string;
}

function CustomEfficiencyTooltip({ active, payload, label }: TooltipProps) {
  if (active && payload && payload.length > 0) {
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
}

function CustomCostTooltip({ active, payload, label }: TooltipProps) {
  if (active && payload && payload.length > 0) {
    return (
      <div className="bg-gray-800 p-3 rounded-lg border border-gray-700 shadow-xl opacity-95">
        <p className="text-gray-400 text-xs mb-1">{label}</p>
        <p className="font-mono text-xl text-green-400 font-bold">¥{payload[0].value.toLocaleString()}</p>
      </div>
    );
  }
  return null;
}

export default function StatsPage() {
  const { vehicles, selectedVehicleId, setSelectedVehicleId, addVehicle, deleteVehicle, updateVehicle, loading: vehiclesLoading } = useVehicles();
  const { records, loading: recordsLoading } = useFuelRecords(selectedVehicleId);

  const validRecords = useMemo(() => {
    if (!records || records.length === 0) return [];
    const sorted = [...records].sort((a, b) => {
      const timeA = a.date ? new Date(a.date).getTime() : 0;
      const timeB = b.date ? new Date(b.date).getTime() : 0;
      return timeA - timeB;
    });
    return sorted.filter(r => r.fuel_efficiency !== null || r.total_cost !== null);
  }, [records]);

  const data = useMemo(() => {
    return validRecords.map((r, i) => ({
      name: r.date || `Record ${i + 1}`,
      efficiency: r.fuel_efficiency || 0,
      cost: r.total_cost || 0,
      gasStation: r.gas_station || "不明",
    }));
  }, [validRecords]);

  if (vehiclesLoading || recordsLoading) {
    return (
      <main className="min-h-screen bg-black text-white p-4 md:p-8 pb-20 font-sans flex flex-col items-center">
        <div className="w-full max-w-5xl">
          {/* ヘッダー (ソリッド表示) */}
          <header className="flex items-center justify-between py-4 mb-2 sticky top-0 bg-black/80 backdrop-blur-md z-10">
            <div className="flex items-center gap-4">
              <Link href="/app" className="p-2 bg-gray-900 rounded-full hover:bg-gray-800 transition">
                <ArrowLeft className="w-5 h-5 text-gray-300" />
              </Link>
              <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
                <TrendingUp className="w-6 h-6 text-blue-500" /> 統計・推移
              </h1>
            </div>
            
            <div className="flex items-center gap-3">
              <SignedOut>
                <SignInButton forceRedirectUrl="/stats">
                  <button className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold py-1.5 px-4 rounded-full transition shadow-lg">
                    ログイン
                  </button>
                </SignInButton>
              </SignedOut>
              <SignedIn>
                <UserButton />
              </SignedIn>
            </div>
          </header>

          {/* 車両セレクター (すでに読み込み済みの場合は実コンポーネントを表示、初期ロード中のみスケルトンを表示) */}
          {vehiclesLoading ? (
            <div className="w-full mb-6">
              <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
                <div className="flex items-center gap-2 p-1.5 bg-gray-950/40 border border-gray-800/80 rounded-2xl shadow-inner">
                  <div className="w-20 h-8 md:h-[36px] bg-gray-850 rounded-xl animate-pulse" />
                  <div className="w-20 h-8 md:h-[36px] bg-gray-850 rounded-xl animate-pulse" />
                  <div className="w-[34px] h-[34px] bg-gray-850 rounded-xl animate-pulse" />
                </div>
              </div>
            </div>
          ) : (
            <VehicleSelector 
              vehicles={vehicles} 
              selectedVehicleId={selectedVehicleId} 
              onSelect={setSelectedVehicleId} 
              onAddVehicle={addVehicle} 
              onDeleteVehicle={deleteVehicle}
              onUpdateVehicle={updateVehicle}
            />
          )}

          {/* グラフエリアスケルトン (実カードと100%同じ bg/border/内部余白/mb-6の見出し) */}
          <div className="space-y-8">
            <div className="bg-gray-900/50 border border-gray-800 rounded-3xl p-5 md:p-8">
              {/* グラフタイトル (ソリッド表示・実画面と全く同じ mb-6) */}
              <h2 className="text-lg font-bold text-gray-300 mb-6 flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-blue-500 shadow-[0_0_10px_#3b82f6]"></span>
                燃費の推移 (km/L)
              </h2>
              {/* グラフコンテナ (実画面と100%同じ相対高さ定義) */}
              <div className="h-64 md:h-80 w-full relative">
                <div className="absolute inset-0 bg-gray-950/40 rounded-2xl border border-gray-800/50 p-6 flex flex-col justify-between">
                  <div className="flex-1 flex items-end gap-4 px-4 pb-2 border-b border-gray-800/80">
                    {/* Mock line chart points */}
                    <div className="flex-1 flex flex-col items-center justify-end h-full relative">
                      <div className="absolute w-2.5 h-2.5 rounded-full bg-blue-500/40 bottom-[20%] animate-pulse" />
                      <div className="w-px h-full bg-gray-850/60 border-dashed" />
                    </div>
                    <div className="flex-1 flex flex-col items-center justify-end h-full relative">
                      <div className="absolute w-2.5 h-2.5 rounded-full bg-blue-500/40 bottom-[50%] animate-pulse" />
                      <div className="w-px h-full bg-gray-850/60 border-dashed" />
                    </div>
                    <div className="flex-1 flex flex-col items-center justify-end h-full relative">
                      <div className="absolute w-2.5 h-2.5 rounded-full bg-blue-500/40 bottom-[35%] animate-pulse" />
                      <div className="w-px h-full bg-gray-850/60 border-dashed" />
                    </div>
                    <div className="flex-1 flex flex-col items-center justify-end h-full relative">
                      <div className="absolute w-2.5 h-2.5 rounded-full bg-blue-500/40 bottom-[70%] animate-pulse" />
                      <div className="w-px h-full bg-gray-850/60 border-dashed" />
                    </div>
                    <div className="flex-1 flex flex-col items-center justify-end h-full relative">
                      <div className="absolute w-2.5 h-2.5 rounded-full bg-blue-500/40 bottom-[60%] animate-pulse" />
                      <div className="w-px h-full bg-gray-850/60 border-dashed" />
                    </div>
                  </div>
                  <div className="flex justify-between text-[10px] text-gray-600 mt-2 px-2">
                    <div className="w-8 h-3 bg-gray-800 rounded animate-pulse" />
                    <div className="w-8 h-3 bg-gray-800 rounded animate-pulse" />
                    <div className="w-8 h-3 bg-gray-800 rounded animate-pulse" />
                    <div className="w-8 h-3 bg-gray-800 rounded animate-pulse" />
                    <div className="w-8 h-3 bg-gray-800 rounded animate-pulse" />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gray-900/50 border border-gray-800 rounded-3xl p-5 md:p-8">
              {/* グラフタイトル (ソリッド表示・実画面と全く同じ mb-6) */}
              <h2 className="text-lg font-bold text-gray-300 mb-6 flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-green-500 shadow-[0_0_10px_#22c55e]"></span>
                支払総額の推移 (円)
              </h2>
              {/* グラフコンテナ (実画面と100%同じ相対高さ定義) */}
              <div className="h-64 w-full relative">
                <div className="absolute inset-0 bg-gray-950/40 rounded-2xl border border-gray-800/50 p-6 flex flex-col justify-between">
                  <div className="flex-1 flex items-end gap-6 px-4 pb-2 border-b border-gray-800/80">
                    {/* Mock bar chart columns */}
                    <div className="flex-1 bg-green-500/20 rounded-t h-[30%] animate-pulse" />
                    <div className="flex-1 bg-green-500/20 rounded-t h-[65%] animate-pulse" />
                    <div className="flex-1 bg-green-500/20 rounded-t h-[45%] animate-pulse" />
                    <div className="flex-1 bg-green-500/20 rounded-t h-[80%] animate-pulse" />
                    <div className="flex-1 bg-green-500/20 rounded-t h-[55%] animate-pulse" />
                  </div>
                  <div className="flex justify-between text-[10px] text-gray-600 mt-2 px-2">
                    <div className="w-8 h-3 bg-gray-800 rounded animate-pulse" />
                    <div className="w-8 h-3 bg-gray-800 rounded animate-pulse" />
                    <div className="w-8 h-3 bg-gray-800 rounded animate-pulse" />
                    <div className="w-8 h-3 bg-gray-800 rounded animate-pulse" />
                    <div className="w-8 h-3 bg-gray-800 rounded animate-pulse" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white p-4 md:p-8 pb-20 font-sans flex flex-col items-center">
      <div className="w-full max-w-5xl">
      
        {/* ヘッダー */}
        <header className="flex items-center justify-between py-4 mb-2 sticky top-0 bg-black/80 backdrop-blur-md z-10 w-full">
          <div className="flex items-center gap-4">
            <Link href="/app" className="p-2 bg-gray-900 rounded-full hover:bg-gray-800 transition">
              <ArrowLeft className="w-5 h-5 text-gray-300" />
            </Link>
            <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-blue-500" /> 統計・推移
            </h1>
          </div>
          
          <div className="flex items-center gap-3">
            <SignedOut>
              <SignInButton forceRedirectUrl="/stats">
                <button className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold py-1.5 px-4 rounded-full transition shadow-lg">
                  ログイン
                </button>
              </SignInButton>
            </SignedOut>
            <SignedIn>
              <UserButton />
            </SignedIn>
          </div>
        </header>

        {/* ★追加: 車両セレクタータブ */}
        <VehicleSelector 
          vehicles={vehicles} 
          selectedVehicleId={selectedVehicleId} 
          onSelect={setSelectedVehicleId} 
          onAddVehicle={addVehicle} 
          onDeleteVehicle={deleteVehicle}
          onUpdateVehicle={updateVehicle}
        />

        {records.length < 2 ? (
          <div className="text-center py-20 text-gray-600">
            <TrendingUp className="w-12 h-12 text-gray-800 mx-auto mb-4" />
            <p>グラフを表示するには、この車両に少なくとも2件以上の記録が必要です。</p>
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
                        const parts = val.split('-');
                        if (parts.length >= 3) return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
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
                        if (parts.length >= 3) return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
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
