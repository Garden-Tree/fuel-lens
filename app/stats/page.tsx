"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
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
  ReferenceLine
} from "recharts";

import { useFuelRecords } from "@/lib/useFuelRecords";
import { useVehicles } from "@/lib/useVehicles";
import { formatPricePerUnit } from "@/lib/calculations";
import {
  type Period,
  buildEfficiencyAxis,
  buildEfficiencySeries,
  buildMonthlyCostSeries,
  buildTimeDomain,
  countUnknownDate,
  filterByPeriod,
  hasStatsData,
  sortByDateAsc,
  summarize,
} from "@/lib/stats";
import VehicleSelector from "@/components/VehicleSelector";

interface TooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
    payload: {
      name: string;
      timestamp: number;
      efficiency: number;
      cost: number;
      gasStation: string;
    };
  }>;
  label?: string;
}

function CustomEfficiencyTooltip({ active, payload }: TooltipProps) {
  if (active && payload && payload.length > 0) {
    const data = payload[0].payload;
    let formattedDate = data.name;
    const parts = data.name.split('-');
    if (parts.length === 3) {
      formattedDate = `${parts[0]}/${parseInt(parts[1])}/${parseInt(parts[2])}`;
    }
    return (
      <div className="bg-gray-800 p-3 rounded-lg border border-gray-700 shadow-xl opacity-95">
        <p className="text-gray-400 text-xs mb-1">{formattedDate}</p>
        <p className="font-mono text-xl text-blue-400 font-bold">{payload[0].value.toFixed(2)} km/L</p>
        <p className="text-xs text-gray-500 mt-1 truncate max-w-[150px]">{data.gasStation}</p>
      </div>
    );
  }
  return null;
}

interface MonthlyCostTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}

function CustomCostTooltip({ active, payload, label }: MonthlyCostTooltipProps) {
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

/** グラフカード内の「データ不足」表示 */
function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center text-center text-gray-600 text-sm px-4">
      <TrendingUp className="w-8 h-8 text-gray-800 mb-3" />
      <p>{message}</p>
    </div>
  );
}

const PERIOD_OPTIONS: ReadonlyArray<{ value: Period; label: string }> = [
  { value: "all", label: "全期間" },
  { value: "1y", label: "1年" },
  { value: "6m", label: "6ヶ月" },
  { value: "3m", label: "3ヶ月" },
];

export default function StatsPage() {
  const {
    vehicles,
    selectedVehicleId,
    setSelectedVehicleId,
    addVehicle,
    deleteVehicle,
    updateVehicle,
    loading: vehiclesLoading,
    error: vehiclesError,
    readOnly,
  } = useVehicles();
  const { records, loading: recordsLoading, error: recordsError } = useFuelRecords(
    selectedVehicleId,
    vehicles[0]?.id,
    { enabled: !vehiclesLoading }
  );

  // 期間フィルタ (全期間 / 1年 / 6ヶ月 / 3ヶ月)
  const [period, setPeriod] = useState<Period>("all");

  // 日付が不明（欠落・不正）な記録は期間フィルタ・グラフの対象外。件数だけ注記する。
  const unknownDateCount = useMemo(() => countUnknownDate(records), [records]);

  const filteredRecords = useMemo(
    () => filterByPeriod(records, period, new Date()),
    [records, period]
  );

  // 統計に使える値（燃費 or 支払総額）を持つ記録を日付昇順で
  const validRecords = useMemo(
    () => sortByDateAsc(filteredRecords.filter(hasStatsData)),
    [filteredRecords]
  );

  // サマリー集計（平均燃費 Σkm/ΣL・累計給油額・平均単価・km単価）
  const summary = useMemo(() => summarize(validRecords), [validRecords]);

  const { chartData, timeDomain, averageEfficiency, efficiencyAxis } = useMemo(() => {
    const chartData = buildEfficiencySeries(validRecords);
    // 参照線はサマリーカードと同じ Σkm/ΣL を使い、表示上の数値を一致させる
    const averageEfficiency = summary.avgEfficiency;
    return {
      chartData,
      timeDomain: buildTimeDomain(chartData),
      averageEfficiency,
      efficiencyAxis: buildEfficiencyAxis(chartData, averageEfficiency),
    };
  }, [validRecords, summary.avgEfficiency]);

  const monthlyCostData = useMemo(() => buildMonthlyCostSeries(validRecords), [validRecords]);

  const loadError = vehiclesError ?? recordsError;

  const header = (
    <header className="flex items-center justify-between py-4 mb-2 sticky top-0 bg-black/80 backdrop-blur-md z-10 w-full">
      <div className="flex items-center gap-4">
        <Link href="/app" aria-label="ホームに戻る" className="p-2 bg-gray-900 rounded-full hover:bg-gray-800 transition">
          <ArrowLeft className="w-5 h-5 text-gray-300" aria-hidden="true" />
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
  );

  // ヘッダーと車両セレクターは読み込み状態に関係なく常に同じツリー位置に置く。
  // 記録の再読み込み（車両追加・切替など）のたびに VehicleSelector が再マウントされると、
  // 内部の「車両の管理」モーダルが閉じてしまうため。スケルトン切替は下のコンテンツ部分だけで行う。
  return (
    <main className="min-h-screen bg-black text-white p-4 md:p-8 pb-20 font-sans flex flex-col items-center">
      <div className="w-full max-w-5xl">

        {header}

        {loadError && (
          <p role="alert" className="text-xs text-red-400 mb-3 break-words">
            {loadError}
          </p>
        )}

        {/* 車両セレクタータブ (車両の初期ロード中のみスケルトン) */}
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
            readOnly={readOnly}
          />
        )}

        {vehiclesLoading || recordsLoading ? (
          <>
            {/* コンパクトなスケルトン（期間フィルタ・サマリー・グラフ2枚） */}
            <div className="flex justify-end mb-4">
              <div className="w-56 h-9 bg-gray-900 border border-gray-800 rounded-lg animate-pulse" />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-8">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className="h-20 md:h-24 bg-gray-900/50 border border-gray-800 rounded-2xl animate-pulse" />
              ))}
            </div>
            <div className="space-y-8">
              <div className="bg-gray-900/50 border border-gray-800 rounded-3xl p-5 md:p-8">
                <div className="w-40 h-5 bg-gray-800 rounded mb-6 animate-pulse" />
                <div className="h-64 md:h-80 w-full bg-gray-950/40 rounded-2xl border border-gray-800/50 animate-pulse" />
              </div>
              <div className="bg-gray-900/50 border border-gray-800 rounded-3xl p-5 md:p-8">
                <div className="w-40 h-5 bg-gray-800 rounded mb-6 animate-pulse" />
                <div className="h-64 w-full bg-gray-950/40 rounded-2xl border border-gray-800/50 animate-pulse" />
              </div>
            </div>
          </>
        ) : (
          <StatsContent
            period={period}
            onPeriodChange={setPeriod}
            unknownDateCount={unknownDateCount}
            summary={summary}
            validRecordCount={validRecords.length}
            chartData={chartData}
            timeDomain={timeDomain}
            averageEfficiency={averageEfficiency}
            efficiencyAxis={efficiencyAxis}
            monthlyCostData={monthlyCostData}
          />
        )}
      </div>
    </main>
  );
}

interface StatsContentProps {
  period: Period;
  onPeriodChange: (period: Period) => void;
  unknownDateCount: number;
  summary: ReturnType<typeof summarize>;
  validRecordCount: number;
  chartData: ReturnType<typeof buildEfficiencySeries>;
  timeDomain: ReturnType<typeof buildTimeDomain>;
  averageEfficiency: ReturnType<typeof summarize>["avgEfficiency"];
  efficiencyAxis: ReturnType<typeof buildEfficiencyAxis>;
  monthlyCostData: ReturnType<typeof buildMonthlyCostSeries>;
}

/** 読み込み完了後の本体（期間フィルタ・サマリー・グラフ） */
function StatsContent({
  period,
  onPeriodChange: setPeriod,
  unknownDateCount,
  summary,
  validRecordCount,
  chartData,
  timeDomain,
  averageEfficiency,
  efficiencyAxis,
  monthlyCostData,
}: StatsContentProps) {
  return (
    <>
      {/* 期間フィルタ */}
      <div className="flex items-center justify-between gap-3 mb-4 w-full">
        <p className="text-[11px] text-gray-500">
          {unknownDateCount > 0 && `日付不明 ${unknownDateCount}件（期間フィルタ・グラフには含まれません）`}
        </p>
        <div className="flex items-center gap-1 bg-gray-900 rounded-lg p-1 border border-gray-800 shrink-0">
          {PERIOD_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setPeriod(opt.value)}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition ${
                period === opt.value ? "bg-blue-600 text-white shadow-sm" : "text-gray-400 hover:text-white"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* サマリーカード (記録が1件以上あれば表示) */}
      {summary.count > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-8">
          <div
            className="bg-gray-900/50 border border-gray-800 rounded-2xl p-4 md:p-5"
            title={
              summary.meanEfficiency != null
                ? `総走行距離 ÷ 総給油量（満タン法）。各給油の単純平均: ${summary.meanEfficiency.toFixed(2)} km/L`
                : "総走行距離 ÷ 総給油量（満タン法）"
            }
          >
            <p className="text-[10px] md:text-xs text-gray-500 uppercase tracking-wider mb-1">平均燃費</p>
            <p className="text-xl md:text-2xl font-bold font-mono text-blue-400">
              {summary.avgEfficiency != null ? summary.avgEfficiency.toFixed(2) : "--"}
              <span className="text-xs text-gray-500 ml-1">km/L</span>
            </p>
            {summary.meanEfficiency != null && summary.avgEfficiency != null && (
              <p className="text-[10px] text-gray-600 mt-1 font-mono">
                単純平均 {summary.meanEfficiency.toFixed(2)}
              </p>
            )}
          </div>
          <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-4 md:p-5">
            <p className="text-[10px] md:text-xs text-gray-500 uppercase tracking-wider mb-1">累計給油額</p>
            <p className="text-xl md:text-2xl font-bold font-mono text-green-400">
              ¥{summary.totalCost.toLocaleString()}
            </p>
          </div>
          <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-4 md:p-5">
            <p className="text-[10px] md:text-xs text-gray-500 uppercase tracking-wider mb-1">平均単価</p>
            <p className="text-xl md:text-2xl font-bold font-mono text-gray-200">
              {summary.avgPricePerUnit != null ? `¥${formatPricePerUnit(summary.avgPricePerUnit)}` : "--"}
              <span className="text-xs text-gray-500 ml-1">/L</span>
            </p>
          </div>
          <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-4 md:p-5">
            <p className="text-[10px] md:text-xs text-gray-500 uppercase tracking-wider mb-1">走行コスト</p>
            <p className="text-xl md:text-2xl font-bold font-mono text-gray-200">
              {summary.costPerKm != null ? `¥${summary.costPerKm.toFixed(1)}` : "--"}
              <span className="text-xs text-gray-500 ml-1">/km</span>
            </p>
          </div>
        </div>
      )}

      {validRecordCount === 0 ? (
        <div className="text-center py-20 text-gray-600">
          <TrendingUp className="w-12 h-12 text-gray-800 mx-auto mb-4" />
          <p>
            {period === "all"
              ? "この車両にはまだ統計に使える記録がありません。"
              : "この期間の記録がありません。期間を広げてみてください。"}
          </p>
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
              {chartData.length < 2 ? (
                <ChartEmpty
                  message={
                    period === "all"
                      ? "燃費の推移を表示するには、燃費が算出された記録が2件以上必要です。"
                      : "この期間の燃費記録が2件未満です。期間を広げてみてください。"
                  }
                />
              ) : (
              <ResponsiveContainer width="100%" height="100%">
                {/* key={period}: 期間切替時にデータ点数が大きく変わると線が不自然に変形するため、再マウントして新規描画させる */}
                <LineChart key={period} data={chartData} margin={{ top: 10, right: 10, left: 30, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorEfficiency" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" vertical={false} />
                  <XAxis
                    type="number"
                    scale="time"
                    dataKey="timestamp"
                    stroke="#4a5568"
                    fontSize={11}
                    tickMargin={10}
                    domain={timeDomain ?? ['auto', 'auto']}
                    tickFormatter={(val) => {
                      const date = new Date(val);
                      return `${date.getMonth() + 1}/${date.getDate()}`;
                    }}
                  />
                  <YAxis
                    stroke="#4a5568"
                    fontSize={10}
                    tickMargin={6}
                    domain={efficiencyAxis.domain ?? ['auto', 'auto']}
                    ticks={efficiencyAxis.ticks}
                    tick={(props) => {
                      const { x, y, payload } = props as { x: number; y: number; payload: { value: number } };
                      // 目盛り値は toFixed(2) で丸めた値なので、同じく丸めた averageTick と比較する
                      const avgTick = efficiencyAxis.averageTick;
                      const isAvg = avgTick != null && Math.abs(payload.value - avgTick) < 1e-6;
                      return (
                        <text
                          x={x}
                          y={y}
                          dy={4}
                          textAnchor="end"
                          fill={isAvg ? '#f87171' : '#4a5568'}
                          fontSize={isAvg ? 10 : 11}
                          fontWeight={isAvg ? 'bold' : 'normal'}
                        >
                          {isAvg ? `平均 ${avgTick.toFixed(2)}` : payload.value.toFixed(1)}
                        </text>
                      );
                    }}
                  />
                  <Tooltip content={<CustomEfficiencyTooltip />} cursor={{ stroke: '#4a5568', strokeWidth: 1, strokeDasharray: '3 3' }} />
                  {efficiencyAxis.averageTick != null && averageEfficiency != null && (
                    <ReferenceLine
                      y={efficiencyAxis.averageTick}
                      stroke="#f87171"
                      strokeDasharray="4 3"
                      strokeWidth={1.5}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="efficiency"
                    stroke="#3b82f6"
                    strokeWidth={4}
                    dot={{ r: 5, fill: '#1e3a8a', stroke: '#3b82f6', strokeWidth: 2 }}
                    activeDot={{ r: 7, fill: '#60a5fa', stroke: '#fff', strokeWidth: 2 }}
                    animationDuration={500}
                  />
                </LineChart>
              </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* 支払総額グラフ */}
          <div className="bg-gray-900/50 border border-gray-800 rounded-3xl p-5 md:p-8">
            <h2 className="text-lg font-bold text-gray-300 mb-6 flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-green-500 shadow-[0_0_10px_#22c55e]"></span>
              支払総額の推移 (円)
            </h2>
            <div className="h-64 w-full relative">
              {monthlyCostData.length === 0 ? (
                <ChartEmpty message="支払総額が記録された給油がありません。" />
              ) : (
              <ResponsiveContainer width="100%" height="100%">
                {/* key={period}: 期間切替時は再マウントして新規描画 (LineChartと同じ理由) */}
                <BarChart key={period} data={monthlyCostData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" vertical={false} />
                  <XAxis
                    dataKey="month"
                    stroke="#4a5568"
                    fontSize={11}
                    tickMargin={10}
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
                    barSize={40}
                    animationDuration={500}
                  />
                </BarChart>
              </ResponsiveContainer>
              )}
            </div>
          </div>

        </div>
      )}
    </>
  );
}
