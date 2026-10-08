"use client";

import { useMemo, useState } from "react";
import { TrendingUp } from "lucide-react";
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

import { useVehicleScope } from "@/lib/useVehicleScope";
import { formatPricePerUnit } from "@/lib/calculations";
import {
  type EfficiencyAxis,
  type EfficiencyPoint,
  type MonthlyCostPoint,
  type Period,
  type PriceDelta,
  type PricePoint,
  type StationComparison,
  type StatsSummary,
  type TimeDomain,
  buildEfficiencyAxis,
  buildEfficiencySeries,
  buildMonthlyCostSeries,
  buildPriceAxis,
  buildPriceSeries,
  buildTimeDomain,
  countUnknownDate,
  filterByPeriod,
  hasStatsData,
  priceDelta,
  sortByDateAsc,
  summarize,
  summarizeStations,
} from "@/lib/stats";
import VehicleSelector from "@/components/VehicleSelector";
import { HookErrorLine, PageHeader, ReadOnlyCaption } from "@/components/AppShell";

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

interface PriceTooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
    payload: PricePoint;
  }>;
}

function CustomPriceTooltip({ active, payload }: PriceTooltipProps) {
  if (active && payload && payload.length > 0) {
    const data = payload[0].payload;
    const d = new Date(data.timestamp);
    return (
      <div className="bg-gray-800 p-3 rounded-lg border border-gray-700 shadow-xl opacity-95">
        <p className="text-gray-400 text-xs mb-1">{`${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`}</p>
        <p className="font-mono text-xl text-amber-400 font-bold">
          ¥{formatPricePerUnit(data.price)}<span className="text-xs text-gray-400 ml-1">/L</span>
        </p>
        <p className="text-xs text-gray-500 mt-1 truncate max-w-[180px]">{data.station ?? "スタンド不明"}</p>
      </div>
    );
  }
  return null;
}

/** "YYYY-MM-DD" → "YYYY/M/D" */
function formatDateLabel(date: string): string {
  const [y, m, d] = date.split("-");
  return `${y}/${Number(m)}/${Number(d)}`;
}

/** 単価の差（円/L）を符号付きで表示する。0.1 円未満の差は "±0.0" */
function formatPriceDiff(diff: number): string {
  const rounded = Math.round(diff * 10) / 10;
  if (rounded === 0) return "±0.0";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(1)}`;
}

/** 値上がりは赤、値下がりは緑、変わらなければ灰色 */
function priceDiffClass(diff: number): string {
  const rounded = Math.round(diff * 10) / 10;
  if (rounded > 0) return "text-red-400";
  if (rounded < 0) return "text-emerald-400";
  return "text-gray-400";
}

/** スタンド別の単価に表示する最大件数 */
const MAX_STATION_ROWS = 8;
/** スタンド別の単価の棒で、表示中の最安スタンドに割り当てる幅（%）。最高は 100% */
const STATION_BAR_MIN_WIDTH = 15;

const PERIOD_OPTIONS: ReadonlyArray<{ value: Period; label: string }> = [
  { value: "all", label: "全期間" },
  { value: "1y", label: "1年" },
  { value: "6m", label: "6ヶ月" },
  { value: "3m", label: "3ヶ月" },
];

export default function StatsPage() {
  // 選択中の車両とその記録（useVehicles + useFuelRecords。記録は車両ごとの方式で連鎖計算済み）
  const {
    vehicles,
    selectedVehicleId,
    setSelectedVehicleId,
    records,
    vehiclesLoading,
    loading,
    error: loadError,
    readOnly,
    vehicleActions,
  } = useVehicleScope();

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

  // 単価トレンドとスタンド比較（期間フィルタ後の記録。単価・店舗名の有無は各関数が判定する）
  const stationComparison = useMemo(() => summarizeStations(filteredRecords), [filteredRecords]);
  const { priceData, priceTimeDomain, priceAxis } = useMemo(() => {
    const priceData = buildPriceSeries(filteredRecords);
    return {
      priceData,
      priceTimeDomain: buildTimeDomain(priceData),
      // 平均線は期間の平均単価（Σ支払総額 ÷ Σ給油量。サマリーカードの平均単価と同じ規則）
      priceAxis: buildPriceAxis(priceData, stationComparison.overallAvgPrice),
    };
  }, [filteredRecords, stationComparison.overallAvgPrice]);
  // 「前回比」は最新の給油についての表示なので、比較の基準（前回・30日/90日平均）が期間フィルタで欠けないよう全記録で求める
  const latestPriceDelta = useMemo(() => priceDelta(records), [records]);

  // ヘッダーと車両セレクターは読み込み状態に関係なく常に同じツリー位置に置く。
  // 記録の再読み込み（車両追加・切替など）のたびに VehicleSelector が再マウントされると、
  // 内部の「車両の管理」モーダルが閉じてしまうため。スケルトン切替は下のコンテンツ部分だけで行う。
  return (
    <main className="min-h-screen bg-black text-white p-4 md:p-8 pb-20 font-sans flex flex-col items-center">
      <div className="w-full max-w-5xl">

        <PageHeader title="統計・推移" icon={TrendingUp} backHref="/app" />

        <HookErrorLine error={loadError} />
        <ReadOnlyCaption show={readOnly} />

        {/* 車両セレクタータブ (車両の初期ロード中のみスケルトン) */}
        <VehicleSelector
          loading={vehiclesLoading}
          vehicles={vehicles}
          selectedVehicleId={selectedVehicleId}
          onSelect={setSelectedVehicleId}
          onAddVehicle={vehicleActions.addVehicle}
          onDeleteVehicle={vehicleActions.deleteVehicle}
          onUpdateVehicle={vehicleActions.updateVehicle}
          readOnly={readOnly}
        />

        {loading ? (
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
            priceData={priceData}
            priceTimeDomain={priceTimeDomain}
            priceAxis={priceAxis}
            latestPriceDelta={latestPriceDelta}
            stationComparison={stationComparison}
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
  summary: StatsSummary;
  validRecordCount: number;
  chartData: EfficiencyPoint[];
  timeDomain: TimeDomain | null;
  averageEfficiency: StatsSummary["avgEfficiency"];
  efficiencyAxis: EfficiencyAxis;
  monthlyCostData: MonthlyCostPoint[];
  priceData: PricePoint[];
  priceTimeDomain: TimeDomain | null;
  priceAxis: EfficiencyAxis;
  latestPriceDelta: PriceDelta;
  stationComparison: StationComparison;
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
  priceData,
  priceTimeDomain,
  priceAxis,
  latestPriceDelta,
  stationComparison,
}: StatsContentProps) {
  // 上位 MAX_STATION_ROWS 件。「最安」のスタンドが入らないときは最後の 1 件と入れ替えて必ず見せる
  let stationRows = stationComparison.groups.slice(0, MAX_STATION_ROWS);
  const cheapestGroup = stationComparison.groups.find(g => g.key === stationComparison.cheapestKey);
  if (cheapestGroup && !stationRows.includes(cheapestGroup)) {
    stationRows = [...stationRows.slice(0, MAX_STATION_ROWS - 1), cheapestGroup];
  }
  const hiddenStationCount = stationComparison.groups.length - stationRows.length;
  // 棒の長さ: 表示中のスタンドの平均単価の最安 → 15%、最高 → 100% に線形で割り当てる。
  // 単価の差は数円程度でゼロ基準だと見分けられないため、差を強調する（1 件だけ・全て同額なら 100%）
  const stationPrices = stationRows.flatMap(g => (g.avgPrice != null ? [g.avgPrice] : []));
  const minStationPrice = stationPrices.length > 0 ? Math.min(...stationPrices) : null;
  const maxStationPrice = stationPrices.length > 0 ? Math.max(...stationPrices) : null;
  const stationBarWidth = (price: number | null): number => {
    if (price == null || minStationPrice == null || maxStationPrice == null) return 0;
    if (maxStationPrice <= minStationPrice) return 100;
    return STATION_BAR_MIN_WIDTH + ((price - minStationPrice) / (maxStationPrice - minStationPrice)) * (100 - STATION_BAR_MIN_WIDTH);
  };
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

          {/* 単価の推移 */}
          <div className="bg-gray-900/50 border border-gray-800 rounded-3xl p-5 md:p-8">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 mb-6">
              <h2 className="text-lg font-bold text-gray-300 flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-amber-500 shadow-[0_0_10px_#f59e0b]"></span>
                単価の推移 (円/L)
              </h2>
              {latestPriceDelta.latest && (
                <p className="text-[11px] text-gray-500 font-mono flex flex-wrap gap-x-3 gap-y-1">
                  <span>
                    最新 <span className="text-gray-300">¥{formatPricePerUnit(latestPriceDelta.latest.price)}</span>
                    （{formatDateLabel(latestPriceDelta.latest.date)}）
                  </span>
                  {latestPriceDelta.diffFromPrevious != null && (
                    <span>
                      前回比{" "}
                      <span className={priceDiffClass(latestPriceDelta.diffFromPrevious)}>
                        {formatPriceDiff(latestPriceDelta.diffFromPrevious)}
                      </span>
                    </span>
                  )}
                  {latestPriceDelta.diffFromAvg30 != null && (
                    <span title="最新の給油日から遡って30日以内の、ほかの給油の単価の平均との差">
                      30日平均比{" "}
                      <span className={priceDiffClass(latestPriceDelta.diffFromAvg30)}>
                        {formatPriceDiff(latestPriceDelta.diffFromAvg30)}
                      </span>
                    </span>
                  )}
                  {latestPriceDelta.diffFromAvg90 != null && (
                    <span title="最新の給油日から遡って90日以内の、ほかの給油の単価の平均との差">
                      90日平均比{" "}
                      <span className={priceDiffClass(latestPriceDelta.diffFromAvg90)}>
                        {formatPriceDiff(latestPriceDelta.diffFromAvg90)}
                      </span>
                    </span>
                  )}
                </p>
              )}
            </div>
            <div className="h-64 md:h-72 w-full relative">
              {priceData.length < 2 ? (
                <ChartEmpty
                  message={
                    period === "all"
                      ? "単価の推移を表示するには、単価が分かる記録が2件以上必要です。"
                      : "この期間の単価の記録が2件未満です。期間を広げてみてください。"
                  }
                />
              ) : (
              <ResponsiveContainer width="100%" height="100%">
                {/* key={period}: 期間切替時は再マウントして新規描画 (燃費グラフと同じ理由) */}
                <LineChart key={period} data={priceData} margin={{ top: 10, right: 10, left: 30, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" vertical={false} />
                  <XAxis
                    type="number"
                    scale="time"
                    dataKey="timestamp"
                    stroke="#4a5568"
                    fontSize={11}
                    tickMargin={10}
                    domain={priceTimeDomain ?? ['auto', 'auto']}
                    tickFormatter={(val) => {
                      const date = new Date(val);
                      return `${date.getMonth() + 1}/${date.getDate()}`;
                    }}
                  />
                  <YAxis
                    stroke="#4a5568"
                    fontSize={10}
                    tickMargin={6}
                    domain={priceAxis.domain ?? ['auto', 'auto']}
                    ticks={priceAxis.ticks}
                    tick={(props) => {
                      const { x, y, payload } = props as { x: number; y: number; payload: { value: number } };
                      // 目盛り値・averageTick とも小数第1位に丸め済み
                      const avgTick = priceAxis.averageTick;
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
                          {isAvg ? `平均 ${avgTick.toFixed(1)}` : payload.value.toFixed(1)}
                        </text>
                      );
                    }}
                  />
                  <Tooltip content={<CustomPriceTooltip />} cursor={{ stroke: '#4a5568', strokeWidth: 1, strokeDasharray: '3 3' }} />
                  {priceAxis.averageTick != null && (
                    <ReferenceLine
                      y={priceAxis.averageTick}
                      stroke="#f87171"
                      strokeDasharray="4 3"
                      strokeWidth={1.5}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="price"
                    stroke="#f59e0b"
                    strokeWidth={3}
                    dot={{ r: 4, fill: '#78350f', stroke: '#f59e0b', strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: '#fbbf24', stroke: '#fff', strokeWidth: 2 }}
                    animationDuration={500}
                  />
                </LineChart>
              </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* スタンド別の単価 */}
          <div className="bg-gray-900/50 border border-gray-800 rounded-3xl p-5 md:p-8">
            <h2 className="text-lg font-bold text-gray-300 mb-6 flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-violet-500 shadow-[0_0_10px_#8b5cf6]"></span>
              スタンド別の単価
            </h2>
            {stationRows.length === 0 ? (
              <div className="py-10">
                <ChartEmpty
                  message={
                    period === "all"
                      ? "スタンド名が記録された給油がありません。"
                      : "この期間にスタンド名が記録された給油がありません。"
                  }
                />
              </div>
            ) : (
              <>
                <ul className="space-y-2.5">
                  {stationRows.map(g => {
                    const isCheapest = g.key === stationComparison.cheapestKey;
                    const barWidth = stationBarWidth(g.avgPrice);
                    return (
                      <li
                        key={g.key}
                        className={`rounded-2xl border p-3 md:p-4 ${
                          isCheapest ? "border-emerald-500/40 bg-emerald-500/5" : "border-gray-800 bg-gray-950/40"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            {/* 店舗名にブランド名がそのまま含まれるとき（"ENEOS 調布店" など）はバッジを省く */}
                            {g.brand && !g.label.toUpperCase().includes(g.brand.toUpperCase()) && (
                              <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-gray-800 text-gray-300 border border-gray-700">
                                {g.brand}
                              </span>
                            )}
                            <span className="truncate text-sm text-gray-200" title={g.label}>{g.label}</span>
                            {isCheapest && (
                              <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                最安
                              </span>
                            )}
                          </div>
                          <span className="shrink-0 text-xs text-gray-500">{g.visits}回</span>
                        </div>
                        <div className="mt-2 flex items-center gap-3">
                          <div className="flex-1 h-2 rounded-full bg-gray-800 overflow-hidden" aria-hidden="true">
                            <div
                              className={`h-full rounded-full ${isCheapest ? "bg-emerald-500" : "bg-amber-500/80"}`}
                              style={{ width: `${barWidth}%` }}
                            />
                          </div>
                          <span className="shrink-0 font-mono text-sm font-bold text-gray-200 text-right">
                            {g.avgPrice != null ? `¥${formatPricePerUnit(g.avgPrice)}` : "--"}
                            <span className="text-[10px] text-gray-500 font-normal ml-0.5">/L</span>
                          </span>
                        </div>
                        {g.lastDate && (
                          <p className="mt-1.5 text-[11px] text-gray-500 font-mono">
                            {g.lastPrice != null
                              ? `最新 ¥${formatPricePerUnit(g.lastPrice)}（${formatDateLabel(g.lastDate)}）`
                              : `最終給油 ${formatDateLabel(g.lastDate)}`}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {hiddenStationCount > 0 && (
                  <p className="mt-3 text-xs text-gray-500 text-center">他 {hiddenStationCount} 件</p>
                )}
                <p className="mt-4 text-[10px] text-gray-600 leading-relaxed">
                  平均単価は 支払総額 ÷ 給油量。表記ゆれ（全角・半角、会社名、末尾の「店」など）は同じスタンドとしてまとめています。
                  「最安」は単価の分かる給油が2回以上あるスタンドどうしで比べています。棒の長さは表示中の最安〜最高の差を強調しています。
                </p>
              </>
            )}
          </div>

        </div>
      )}
    </>
  );
}
