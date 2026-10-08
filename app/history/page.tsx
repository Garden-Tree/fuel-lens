"use client";

import { useState, useMemo } from "react";
import { Trash2, MapPin, Calendar, BarChart3, Edit2, Download, Car } from "lucide-react";

import type { FuelRecord } from "@/lib/types";
import EditFuelRecordForm from "@/components/EditFuelRecordForm";
import { useVehicleScope } from "@/lib/useVehicleScope";
import VehicleSelector from "@/components/VehicleSelector";
import { HookErrorLine, PageHeader, ReadOnlyCaption, type HeaderLink } from "@/components/AppShell";
import { useToast } from "@/components/Toast";
import { useRecordForm } from "@/lib/useRecordForm";
import { useRecordEditing } from "@/lib/useRecordEditing";
import RecordStats from "@/components/RecordStats";
import { efficiencyNullReason } from "@/lib/format";
import { normalizeDateString } from "@/lib/dates";
import { distanceModeOf } from "@/lib/fillChain";
import {
  RECORD_CSV_EXTRA_HEADERS,
  buildCsv,
  downloadTextFile,
  escapeCsvField,
  formatCsvNumber,
  formatRecordExtraCsvFields,
  toSafeFilenamePart,
} from "@/lib/csv";

/** created_at（ISO 日時）をミリ秒に変換する。欠落・解析不能なら 0（最も古い扱い） */
function createdAtMs(createdAt: string | null | undefined): number {
  if (!createdAt) return 0;
  const t = new Date(createdAt).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** 月フィルタの選択肢（"1"〜"12"） */
const MONTH_OPTIONS: readonly string[] = Array.from({ length: 12 }, (_, i) => String(i + 1));

/** ヘッダーのリンク（グラフを見る） */
const HISTORY_HEADER_LINKS: readonly HeaderLink[] = [
  { href: "/stats", label: "グラフを見る", icon: BarChart3, showLabelFrom: "sm", tone: "solid" },
];

export default function HistoryPage() {
  const { toast, confirm } = useToast();
  // 選択中の車両とその記録（useVehicles + useFuelRecords）。records は年・月フィルタ前の、この車両（と表示する未分類）の全記録
  const scope = useVehicleScope();
  const {
    vehicles,
    selectedVehicleId,
    setSelectedVehicleId,
    distanceMode,
    records,
    vehiclesLoading,
    loading: isLoading,
    error: hookError,
    readOnly,
    vehicleActions,
    recordActions: { deleteRecord, updateRecord },
  } = scope;

  // 編集フォームの開閉と保存（/app の最新記録カードと共用）。車両または距離の入力方式を切り替えたら閉じる
  // （開いたままだと、切り替え前の車両の記録を更新してしまう・入力欄が走行距離 / オドメーターで合わなくなるため）
  const form = useRecordForm();
  const editing = useRecordEditing({ scope, form, toast, confirm, updatedMessage: "記録を更新しました" });

  const [movingId, setMovingId] = useState<string | null>(null);
  // 進行中の操作（削除・移動）の対象レコードID。二重クリック防止用
  const [busyId, setBusyId] = useState<string | null>(null);

  const [sortType, setSortType] = useState<"date" | "created_at">("date");

  // 年・月フィルタ
  const [filterYear, setFilterYear] = useState<string>("all");
  const [filterMonth, setFilterMonth] = useState<string>("all");

  // 車両を切り替えたら「移動先の選択」も閉じ、年・月フィルタも解除する（方式の切り替えでは解除しない）
  // （エフェクトではなく「前回の値を state に保持してレンダー中に調整する」React 推奨パターン）
  const [filterVehicleId, setFilterVehicleId] = useState(selectedVehicleId);
  if (filterVehicleId !== selectedVehicleId) {
    setFilterVehicleId(selectedVehicleId);
    setMovingId(null);
    setFilterYear("all");
    setFilterMonth("all");
  }

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    records.forEach(r => {
      if (r.date) years.add(String(r.date).slice(0, 4));
    });
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [records]);

  // 選択中の年が記録から消えた（最後の1件を削除した等）場合は「全ての年」として扱う。
  // そのままだと select は「全ての年」と表示されるのに絞り込みが残り、解除できなくなるため。
  const effectiveYear = availableYears.includes(filterYear) ? filterYear : "all";
  const effectiveMonth = MONTH_OPTIONS.includes(filterMonth) ? filterMonth : "all";

  const filteredRecords = useMemo(() => {
    if (effectiveYear === "all" && effectiveMonth === "all") return records;
    return records.filter(r => {
      if (!r.date) return false;
      const y = String(r.date).slice(0, 4);
      const m = String(parseInt(String(r.date).slice(5, 7), 10));
      if (effectiveYear !== "all" && y !== effectiveYear) return false;
      if (effectiveMonth !== "all" && m !== effectiveMonth) return false;
      return true;
    });
  }, [records, effectiveYear, effectiveMonth]);

  const sortedRecords = useMemo(() => {
    if (sortType === "created_at") {
      // 登録（作成）順の新しい順。クラウドは created_at、ローカルの旧データは
      // created_at を持たないため id（Date.now 由来）でフォールバックする。
      // 年・月フィルタ適用済みの filteredRecords を対象にする。
      return [...filteredRecords].sort((a, b) => {
        const createdA = createdAtMs(a.created_at);
        const createdB = createdAtMs(b.created_at);
        if (createdB !== createdA) return createdB - createdA;
        return b.id > a.id ? 1 : b.id < a.id ? -1 : 0;
      });
    }
    // 給油日の新しい順。日付が欠落・不正な記録は最も古い扱い（末尾）にする。
    // "YYYY-MM-DD" 同士の辞書順比較なので NaN が出ず、比較関数の契約を満たす。
    // 同じ給油日なら登録（作成）の新しい順 → id の順で安定化する。
    return [...filteredRecords].sort((a, b) => {
      const dateA = normalizeDateString(a.date);
      const dateB = normalizeDateString(b.date);
      if (dateA !== dateB) {
        if (dateA === null) return 1;
        if (dateB === null) return -1;
        return dateA < dateB ? 1 : -1;
      }
      const createdA = createdAtMs(a.created_at);
      const createdB = createdAtMs(b.created_at);
      if (createdB !== createdA) return createdB - createdA;
      return b.id > a.id ? 1 : b.id < a.id ? -1 : 0;
    });
  }, [filteredRecords, sortType]);

  const handleDelete = async (id: string) => {
    if (busyId || readOnly) return;
    // 確認ダイアログ表示中も busy 扱いにして、同じカードの編集・移動を無効化する
    setBusyId(id);
    try {
      const ok = await confirm("この記録を削除しますか？", { danger: true, confirmLabel: "削除する" });
      if (!ok) return;
      await deleteRecord(id);
      toast("記録を削除しました", { type: "success" });
    } catch (err) {
      console.error(err);
      toast(err instanceof Error ? err.message : "削除に失敗しました", { type: "error" });
    } finally {
      setBusyId(null);
    }
  };

  const handleMoveVehicle = async (recordId: string, targetVehicleId: string) => {
    if (busyId || readOnly) return;
    const targetName = vehicles.find(v => v.id === targetVehicleId)?.name ?? "別の車両";
    // 確認ダイアログ表示中も busy 扱いにして、同じカードの編集・移動を無効化する
    setBusyId(recordId);
    try {
      const ok = await confirm(`この記録を「${targetName}」へ移動しますか？`, { confirmLabel: "移動する" });
      if (!ok) {
        // キャンセルしたら「どの車両に移動しますか？」の選択も閉じる
        setMovingId(null);
        return;
      }
      // オドメーター → トリップメーターの車両へ移すときは、表示中の区間距離（連鎖計算の値）も保存する。
      // 保存値は保存時点の導出値で古いことがあり、トリップモードは保存値をそのまま使うため（docs/design-fill-chain.md 4 章）。
      // 区間が出ない記録（null）は保存値を残す。移動先もオドメーターなら移動先の連鎖で再計算されるので vehicle_id だけ
      const target = vehicles.find(v => v.id === targetVehicleId);
      const chainedDistance = records.find(r => r.id === recordId)?.total_distance ?? null;
      const writeBack = distanceMode === "odometer" && distanceModeOf(target) === "trip" && chainedDistance !== null;
      await updateRecord(
        recordId,
        writeBack ? { vehicle_id: targetVehicleId, total_distance: chainedDistance } : { vehicle_id: targetVehicleId }
      );
      setMovingId(null);
      toast(`「${targetName}」へ移動しました`, { type: "success" });
    } catch (e) {
      console.error(e);
      toast(e instanceof Error ? e.message : "車両の移動に失敗しました", { type: "error" });
    } finally {
      setBusyId(null);
    }
  };

  const startEditing = (record: FuelRecord) => {
    if (readOnly) return;
    editing.startEditing(record);
    setMovingId(null);
  };

  const exportToCsv = () => {
    if (sortedRecords.length === 0) return;

    // 0004 で追加した列（オドメーター・満タン・記録漏れ・燃料種別・メモ）も書き出し、FuelLens CSV の取り込みで往復できるようにする
    // （lib/importers/fuellensCsv.ts は車両別 CSV でも追加列を読む）
    const headers = [
      "給油日",
      "走行距離(km)",
      "給油量(L)",
      "単価(円/L)",
      "支払総額(円)",
      "燃費(km/L)",
      "ガソリンスタンド名",
      RECORD_CSV_EXTRA_HEADERS.odometer,
      RECORD_CSV_EXTRA_HEADERS.isFull,
      RECORD_CSV_EXTRA_HEADERS.missedPrevious,
      RECORD_CSV_EXTRA_HEADERS.fuelType,
      RECORD_CSV_EXTRA_HEADERS.memo,
    ];
    const rows = sortedRecords.map(rec => [
      escapeCsvField(rec.date),
      formatCsvNumber(rec.total_distance),
      formatCsvNumber(rec.fuel_amount),
      formatCsvNumber(rec.price_per_unit),
      formatCsvNumber(rec.total_cost),
      formatCsvNumber(rec.fuel_efficiency),
      escapeCsvField(rec.gas_station),
      ...formatRecordExtraCsvFields(rec),
    ]);

    const currentVehicleName = vehicles.find(v => v.id === selectedVehicleId)?.name || "vehicle";
    const filename = `fuellens_${toSafeFilenamePart(currentVehicleName)}_${new Date().toISOString().slice(0,10)}.csv`;
    downloadTextFile(filename, buildCsv(headers, rows), "text/csv;charset=utf-8;");
  };

  return (
    <main className="min-h-screen bg-black text-white p-4 md:p-8 pb-20 font-sans flex flex-col items-center">
      <div className="w-full max-w-5xl">

        {/* ヘッダー */}
        <PageHeader title="給油履歴" backHref="/app" links={HISTORY_HEADER_LINKS} />

        {/* データ取得エラー / 閲覧専用の表示 */}
        <HookErrorLine error={hookError} />
        <ReadOnlyCaption show={readOnly} />

        {/* 車両セレクター & CSV出力ボタン */}
        <div className="flex items-center justify-between gap-4 mb-6 w-full">
          {/* 左側：車両セレクター（車両の読み込み中はスケルトン） */}
          <div className="flex-grow min-w-0">
            <VehicleSelector
              loading={vehiclesLoading}
              vehicles={vehicles}
              selectedVehicleId={selectedVehicleId}
              onSelect={setSelectedVehicleId}
              onAddVehicle={vehicleActions.addVehicle}
              onDeleteVehicle={vehicleActions.deleteVehicle}
              onUpdateVehicle={vehicleActions.updateVehicle}
              readOnly={readOnly}
              className="w-full"
            />
          </div>

          {/* 右側：CSV出力ボタン */}
          <div className="flex-shrink-0 pb-2">
            {isLoading ? (
              <button
                disabled
                className="flex items-center gap-2 px-3 py-2 bg-gray-900/50 text-gray-500 text-xs font-bold rounded-xl border border-gray-800/80 cursor-not-allowed"
              >
                <Download className="w-4 h-4 text-green-700/50" />
                <span>CSV出力</span>
              </button>
            ) : (
              <button
                disabled={sortedRecords.length === 0}
                onClick={exportToCsv}
                className={`flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-xl border transition ${
                  sortedRecords.length > 0
                    ? "bg-gray-900 hover:bg-gray-800 text-gray-300 hover:text-white border-gray-800 hover:border-gray-700"
                    : "bg-gray-900/50 text-gray-550/40 border-gray-800/50 cursor-not-allowed"
                }`}
                title={sortedRecords.length > 0 ? "表示中の記録をCSV形式でダウンロード" : "出力できる記録がありません"}
              >
                <Download className={`w-4 h-4 ${sortedRecords.length > 0 ? "text-green-500" : "text-green-700/20"}`} />
                <span>CSV出力</span>
              </button>
            )}
          </div>
        </div>

        {/* リスト表示 & ソート操作 */}
        {isLoading ? (
          <>
            {/* 操作パネルスケルトン */}
            <div className="flex items-center justify-end mb-4 w-full">
              <div className="flex items-center gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1">
                <div className="w-[66px] h-7 bg-gray-800/80 rounded-md animate-pulse" />
                <div className="w-[56px] h-7 bg-gray-800/80 rounded-md animate-pulse" />
              </div>
            </div>

            {/* カードリストスケルトン */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 w-full">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 relative overflow-hidden">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                        <Calendar className="w-3 h-3 text-gray-600" />
                        <div className="w-16 h-3 bg-gray-800 rounded animate-pulse" />
                      </div>
                      <div className="flex items-baseline gap-1">
                        <div className="w-20 h-8 bg-gray-800 rounded animate-pulse" />
                        <span className="text-xs font-bold text-blue-500">km/L</span>
                      </div>
                    </div>
                    
                    <div className="text-right flex flex-col items-end">
                      <div className="w-16 h-6 bg-gray-800 rounded animate-pulse mb-1" />
                      <p className="text-[10px] text-gray-500">Total Cost</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm bg-black/20 p-3 rounded-lg">
                    <div className="flex justify-between border-r border-gray-800 pr-2">
                      <span className="text-gray-500 text-xs">給油量</span>
                      <div className="w-8 h-4 bg-gray-800 rounded animate-pulse" />
                    </div>
                    <div className="flex justify-between pl-2">
                      <span className="text-gray-500 text-xs">走行</span>
                      <div className="w-12 h-4 bg-gray-800 rounded animate-pulse" />
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-2 text-xs text-gray-500 pr-24">
                    <MapPin className="w-3 h-3 flex-shrink-0 text-gray-600" />
                    <div className="w-24 h-3 bg-gray-800 rounded animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            {/* 操作パネル */}
            <div className="flex items-center justify-between gap-3 mb-4 w-full flex-wrap">
              {records.length > 0 ? (
                <>
                  {/* 年・月フィルタ */}
                  <div className="flex items-center gap-2">
                    <select
                      value={effectiveYear}
                      aria-label="年で絞り込み"
                      onChange={(e) => setFilterYear(e.target.value)}
                      className="bg-gray-900 border border-gray-800 rounded-lg px-2 py-1.5 text-xs font-bold text-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus:border-blue-500 transition"
                    >
                      <option value="all">全ての年</option>
                      {availableYears.map(y => (
                        <option key={y} value={y}>{y}年</option>
                      ))}
                    </select>
                    <select
                      value={effectiveMonth}
                      aria-label="月で絞り込み"
                      onChange={(e) => setFilterMonth(e.target.value)}
                      className="bg-gray-900 border border-gray-800 rounded-lg px-2 py-1.5 text-xs font-bold text-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus:border-blue-500 transition"
                    >
                      <option value="all">全ての月</option>
                      {MONTH_OPTIONS.map(m => (
                        <option key={m} value={m}>{m}月</option>
                      ))}
                    </select>
                    <span className="text-xs text-gray-500">{sortedRecords.length}件</span>
                  </div>

                  <div className="flex items-center gap-1 bg-gray-900 rounded-lg p-1 border border-gray-800">
                    <button
                      onClick={() => setSortType("date")}
                      className={`px-3 py-1.5 text-xs font-bold rounded-md transition ${sortType === "date" ? "bg-blue-600 text-white shadow-sm" : "text-gray-400 hover:text-white"}`}
                    >
                      給油日順
                    </button>
                    <button
                      onClick={() => setSortType("created_at")}
                      className={`px-3 py-1.5 text-xs font-bold rounded-md transition ${sortType === "created_at" ? "bg-blue-600 text-white shadow-sm" : "text-gray-400 hover:text-white"}`}
                    >
                      登録順
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-1 bg-gray-950/20 rounded-lg p-1 border border-gray-900/50 opacity-40">
                  <button
                    disabled
                    className="px-3 py-1.5 text-xs font-bold rounded-md text-gray-500 cursor-not-allowed"
                  >
                    給油日順
                  </button>
                  <button
                    disabled
                    className="px-3 py-1.5 text-xs font-bold rounded-md text-gray-500 cursor-not-allowed"
                  >
                    登録順
                  </button>
                </div>
              )}
            </div>

            {/* リスト表示 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 w-full">
              {sortedRecords.length === 0 ? (
                <div className="text-center py-20 text-gray-600 col-span-full">
                  <p>
                    {effectiveYear !== "all" || effectiveMonth !== "all"
                      ? "条件に一致する記録がありません"
                      : "この車両の履歴はありません"}
                  </p>
                </div>
              ) : (
                sortedRecords.map((rec) => (
                  editing.editingRecordId === rec.id ? (
                    <div key={`edit-${rec.id}`} className="bg-gray-800 border border-blue-500 ring-1 ring-blue-500 rounded-2xl p-5 relative">
                      <EditFuelRecordForm
                        form={form}
                        onCancel={editing.cancel}
                        onSave={editing.save}
                        saving={editing.saving}
                        disabled={readOnly}
                      />
                    </div>
                  ) : (
                    <div key={rec.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 relative group overflow-hidden">
                      {movingId === rec.id && (
                        <div
                          role="group"
                          aria-label="移動先の車両を選択"
                          className="absolute inset-0 bg-black/95 z-10 p-4 flex flex-col justify-center items-center gap-3 animate-in fade-in duration-200"
                          onKeyDown={(e) => {
                            if (e.key === "Escape") setMovingId(null);
                          }}
                        >
                          <p className="text-xs text-gray-300 font-bold">どの車両に移動しますか？</p>
                          <div className="flex flex-wrap gap-2 justify-center w-full max-h-[140px] overflow-y-auto">
                            {vehicles.filter(v => v.id !== selectedVehicleId).map(v => (
                              <button
                                key={v.id}
                                type="button"
                                onClick={() => handleMoveVehicle(rec.id, v.id)}
                                disabled={busyId === rec.id}
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
                              >
                                {v.name}
                              </button>
                            ))}
                            <button
                              type="button"
                              autoFocus
                              onClick={() => setMovingId(null)}
                              disabled={busyId === rec.id}
                              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white text-xs font-bold rounded-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
                            >
                              キャンセル
                            </button>
                          </div>
                        </div>
                      )}

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
                          {efficiencyNullReason(rec) && (
                            <p className="text-[10px] text-gray-500">{efficiencyNullReason(rec)}</p>
                          )}
                        </div>
                        
                        <div className="text-right">
                          <p className="text-lg font-bold text-green-400 font-mono">
                            ¥{rec.total_cost?.toLocaleString() || "---"}
                          </p>
                          <p className="text-[10px] text-gray-500">Total Cost</p>
                        </div>
                      </div>

                      <RecordStats record={rec} distanceMode={distanceMode} variant="compact" />

                      {/* 操作ボタン群 */}
                      <div className="absolute bottom-4 right-4 flex items-center opacity-100 sm:opacity-60 sm:group-hover:opacity-100 focus-visible:opacity-100 group-focus-within:opacity-100 transition duration-200">
                        {vehicles.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setMovingId(rec.id)}
                            disabled={readOnly || busyId === rec.id}
                            className="p-1.5 text-gray-500 hover:text-blue-400 transition disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded"
                            title="他の車両へ移動"
                            aria-label="他の車両へ移動"
                          >
                            <Car className="w-4 h-4" aria-hidden="true" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => startEditing(rec)}
                          disabled={readOnly || busyId === rec.id}
                          className="p-1.5 text-gray-500 hover:text-blue-400 transition disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded"
                          title="編集"
                          aria-label="この記録を編集"
                        >
                          <Edit2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(rec.id)}
                          disabled={readOnly || busyId === rec.id}
                          className="p-1.5 text-gray-500 hover:text-red-500 transition disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 rounded"
                          title="削除"
                          aria-label="この記録を削除"
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  )
                ))
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}