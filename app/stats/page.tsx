"use client";

import { useMemo, useState } from "react";
import { TrendingUp } from "lucide-react";

import { useVehicleScope } from "@/lib/useVehicleScope";
import { type Period, buildStatsModel } from "@/lib/stats";
import VehicleSelector from "@/components/VehicleSelector";
import { HookErrorLine, PageHeader, ReadOnlyCaption } from "@/components/AppShell";
import PeriodFilter from "./_components/PeriodFilter";
import SummaryCards from "./_components/SummaryCards";
import EfficiencyChart from "./_components/EfficiencyChart";
import MonthlyCostChart from "./_components/MonthlyCostChart";
import PriceTrendChart from "./_components/PriceTrendChart";
import StationComparison from "./_components/StationComparison";
import StatsSkeleton from "./_components/StatsSkeleton";

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

  // 描画に使う集計はすべて buildStatsModel（lib/stats/model.ts）で導出する
  const model = useMemo(() => buildStatsModel(records, period, new Date()), [records, period]);

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
          <StatsSkeleton />
        ) : (
          <>
            <PeriodFilter period={period} onChange={setPeriod} unknownDateCount={model.unknownDateCount} />

            {/* サマリーカード (記録が1件以上あれば表示) */}
            <SummaryCards summary={model.summary} />

            {model.validRecordCount === 0 ? (
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
                <EfficiencyChart
                  period={period}
                  efficiency={model.efficiency}
                  averageEfficiency={model.summary.avgEfficiency}
                />
                <MonthlyCostChart period={period} data={model.monthlyCost} />
                <PriceTrendChart period={period} price={model.price} />
                <StationComparison period={period} stations={model.stations} />
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
