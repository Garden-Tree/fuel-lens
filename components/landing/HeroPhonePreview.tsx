"use client";

import { useState } from "react";
import { Camera, BarChart3, House, History, Settings } from "lucide-react";
import { BrandMark, GroupedList, ListRow, Section, ValueRow, Chip } from "@/components/ui";

type DemoVehicle = "prius" | "aqua";

type DemoData = {
  name: string;
  efficiency: number;
  average: number;
  /** 前回比の差（km/L） */
  diff: number;
  cost: string;
  amount: string;
  unitPrice: string;
  recent: { station: string; sub: string; efficiency: string };
};

const DEMO: Record<DemoVehicle, DemoData> = {
  prius: {
    name: "プリウス",
    efficiency: 22.45,
    average: 20.8,
    diff: 1.62,
    cost: "¥5,480",
    amount: "35.40",
    unitPrice: "¥154.8",
    recent: { station: "ENEOS 新宿SS", sub: "5月21日・レギュラー・¥5,480", efficiency: "22.45" },
  },
  aqua: {
    name: "アクア",
    efficiency: 19.8,
    average: 18.2,
    diff: 0.95,
    cost: "¥4,120",
    amount: "28.50",
    unitPrice: "¥144.6",
    recent: { station: "出光 用賀SS", sub: "5月19日・レギュラー・¥4,120", efficiency: "19.80" },
  },
};

/** メーターの目盛り範囲（km/L） */
const GAUGE_MIN = 10;
const GAUGE_MAX = 25;
const CX = 150;
const CY = 130;
const R = 110;

/** 値（km/L）を半円上の座標にする。左端が最小、右端が最大 */
function gaugePoint(value: number, radius: number) {
  const f = Math.min(1, Math.max(0, (value - GAUGE_MIN) / (GAUGE_MAX - GAUGE_MIN)));
  return { x: CX - radius * Math.cos(Math.PI * f), y: CY - radius * Math.sin(Math.PI * f) };
}

/** 燃費メーター（D デザインのホーム画面のヒーローを静的に再現） */
function EfficiencyGauge({ efficiency, average }: { efficiency: number; average: number }) {
  const end = gaugePoint(efficiency, R);
  const tickIn = gaugePoint(average, R - 12);
  const tickOut = gaugePoint(average, R + 12);
  const label = gaugePoint(average, R + 26);
  return (
    <svg
      role="img"
      aria-label={`燃費メーター。${efficiency.toFixed(2)} km/L、平均${average.toFixed(2)}`}
      viewBox="0 0 300 150"
      className="h-auto w-full max-w-[280px]"
    >
      <path d={`M${CX - R},${CY} A${R},${R} 0 0 1 ${CX + R},${CY}`} fill="none" stroke="var(--color-line)" strokeWidth="14" strokeLinecap="round" />
      <path
        d={`M${CX - R},${CY} A${R},${R} 0 0 1 ${end.x.toFixed(1)},${end.y.toFixed(1)}`}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="14"
        strokeLinecap="round"
      />
      <line
        x1={tickIn.x.toFixed(1)}
        y1={tickIn.y.toFixed(1)}
        x2={tickOut.x.toFixed(1)}
        y2={tickOut.y.toFixed(1)}
        stroke="var(--color-ink)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <g className="num" fontSize="11" fill="var(--color-sub)">
        <text x="32" y="148">{GAUGE_MIN}</text>
        <text x="252" y="148">{GAUGE_MAX}</text>
      </g>
      <text x={label.x.toFixed(1)} y={(label.y + 4).toFixed(1)} textAnchor="middle" fontSize="11" fill="var(--color-sub)">
        平均
      </text>
      <text x="150" y="112" textAnchor="middle" className="num" fontSize="52" fontWeight="700" fill="var(--color-ink)">
        {efficiency.toFixed(2)}
      </text>
      <text x="150" y="136" textAnchor="middle" fontSize="13" fill="var(--color-sub)">
        km/L
      </text>
    </svg>
  );
}

const TAB_ITEMS = [
  { label: "ホーム", Icon: House, active: true },
  { label: "履歴", Icon: History, active: false },
  null,
  { label: "統計", Icon: BarChart3, active: false },
  { label: "設定", Icon: Settings, active: false },
] as const;

/**
 * ヒーローセクション右側の「スマホ画面モック」。実アプリの新しいホーム（燃費メーター・グループリスト・下部タブバー）を静的に再現する。
 * 車両の切り替えだけがインタラクティブなので、この部分だけをクライアントコンポーネントにしている。
 */
export default function HeroPhonePreview() {
  const [selectedVehicle, setSelectedVehicle] = useState<DemoVehicle>("prius");
  const data = DEMO[selectedVehicle];
  const nextVehicle: DemoVehicle = selectedVehicle === "prius" ? "aqua" : "prius";

  return (
    <div className="relative w-full max-w-[370px] overflow-hidden rounded-[44px] border border-border bg-ground p-3 shadow-2xl shadow-black/50">
      {/* スピーカーとインカメラのノッチ */}
      <div className="absolute left-1/2 top-3 z-20 flex h-4 w-32 -translate-x-1/2 items-center justify-center rounded-full bg-black">
        <div className="ml-auto mr-4 h-2.5 w-2.5 rounded-full bg-surface-2" />
      </div>

      {/* アプリ画面（ホーム）の再現 */}
      <div className="flex select-none flex-col overflow-hidden rounded-[34px] bg-ground text-ink">
        <div className="flex flex-col gap-2.5 px-4 pb-4 pt-9">
          <div className="flex items-center justify-between">
            <BrandMark className="text-lg" />
            <Chip showChevron aria-label={`車両を切り替える（デモ）。現在: ${data.name}`} onClick={() => setSelectedVehicle(nextVehicle)} className="rounded-xl">
              {data.name}
            </Chip>
          </div>

          {/* ヒーロー: 前回の燃費 */}
          <section className="flex flex-col items-center gap-1 rounded-hero bg-surface px-4 pb-4 pt-3.5">
            <div className="flex w-full justify-between text-[13px] text-sub">
              <span>前回の燃費</span>
              <span>5/21 {data.recent.station.split(" ")[0]}</span>
            </div>
            <EfficiencyGauge efficiency={data.efficiency} average={data.average} />
            <div className="flex gap-2 text-[13px]">
              <span className="rounded-lg bg-up-bg px-2.5 py-1 font-bold text-up">
                ▲ <span className="num">{data.diff.toFixed(2)}</span> 前回比
              </span>
              <span className="rounded-lg bg-surface-2 px-2.5 py-1 text-[#B8C3CF]">
                平均 <span className="num">{data.average.toFixed(2)}</span>
              </span>
            </div>
          </section>

          <Section title="5月">
            <GroupedList>
              <ValueRow label="給油代" value={data.cost} tone="money" />
              <ValueRow label="給油量" value={data.amount} unit=" L・1回" />
              <ValueRow label="単価" value={data.unitPrice} unit="/L" />
            </GroupedList>
          </Section>

          <Section title="最近の記録">
            <GroupedList>
              <ListRow
                title={data.recent.station}
                subtitle={data.recent.sub}
                trailing={<span className="num text-lg font-bold">{data.recent.efficiency}</span>}
                showChevron
              />
            </GroupedList>
          </Section>
        </div>

        {/* 下部タブバー（中央がスキャンボタン） */}
        <div
          aria-hidden="true"
          className="grid h-[72px] grid-cols-5 items-center border-t border-line bg-ground px-2 pb-3 pt-1.5"
        >
          {TAB_ITEMS.map((item) =>
            item === null ? (
              <div key="scan" className="flex justify-center">
                <span className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full border-4 border-ground bg-scan-gradient">
                  <Camera className="h-6 w-6 text-white" />
                </span>
              </div>
            ) : (
              <span
                key={item.label}
                className={`flex flex-col items-center gap-0.5 text-[11px] ${
                  item.active ? "font-bold text-accent" : "text-sub"
                }`}
              >
                <item.Icon className="h-6 w-6" />
                {item.label}
              </span>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
