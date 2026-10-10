"use client";

import { useMemo, useState } from "react";
import { TrendingUp } from "lucide-react";

import { useVehicleScope } from "@/lib/useVehicleScope";
import { type Period, buildStatsModel } from "@/lib/stats";
import VehicleSelector from "@/components/VehicleSelector";
import { AppFrame, HookErrorLine, PageHeader, ReadOnlyCaption } from "@/components/AppShell";
import PeriodFilter from "./_components/PeriodFilter";
import { CostSummary, EfficiencyHero } from "./_components/SummaryCards";
import EfficiencyChart from "./_components/EfficiencyChart";
import MonthlyCostChart from "./_components/MonthlyCostChart";
import PriceTrendChart from "./_components/PriceTrendChart";
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
    <AppFrame>
      <div className="w-full">
        <PageHeader
          title="統計"
          rightSlot={
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
          }
        />

        <HookErrorLine error={loadError} />
        <ReadOnlyCaption show={readOnly} />

        {loading ? (
          <StatsSkeleton />
        ) : (
          <div className="flex flex-col gap-4 lg:gap-6">
            <PeriodFilter period={period} onChange={setPeriod} unknownDateCount={model.unknownDateCount} />

            {model.validRecordCount === 0 ? (
              <div className="py-20 text-center text-sub">
                <TrendingUp className="mx-auto mb-4 h-12 w-12 text-faint" aria-hidden="true" />
                <p>
                  {period === "all"
                    ? "この車両にはまだ統計に使える記録がありません。"
                    : "この期間の記録がありません。期間を広げてみてください。"}
                </p>
              </div>
            ) : (
              // スマホは 1 カラム（ヒーロー → 費用 → 月ごと → 単価）。PC は 2 カラム（左: ヒーロー / 右: 費用、下段: 月ごと・単価）
              <div className="grid grid-cols-1 items-start gap-4 animate-in fade-in duration-700 lg:grid-cols-2 lg:gap-6">
                <EfficiencyHero summary={model.summary} series={model.efficiency.series}>
                  <EfficiencyChart
                    period={period}
                    efficiency={model.efficiency}
                    averageEfficiency={model.summary.avgEfficiency}
                  />
                </EfficiencyHero>
                <CostSummary summary={model.summary} />
                <MonthlyCostChart period={period} data={model.monthlyCost} />
                <PriceTrendChart period={period} price={model.price} />
                {/* スタンド比較（店舗別の平均単価）は表示しない方針。部品 _components/StationComparison と lib/stats の計算は残している */}
              </div>
            )}
          </div>
        )}
      </div>
    </AppFrame>
  );
}
