"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import { ArrowLeft, Trash2, MapPin, Calendar, BarChart3, Edit2, Download, Car } from "lucide-react";

import { useFuelRecords, FuelRecord } from "@/lib/useFuelRecords";
import EditFuelRecordForm from "@/components/EditFuelRecordForm";
import { useVehicles } from "@/lib/useVehicles";
import VehicleSelector from "@/components/VehicleSelector";
import { useToast } from "@/components/Toast";
import { useRecordForm } from "@/lib/useRecordForm";
import { distanceModeOf, openRunBefore, previousOdometer } from "@/lib/fillChain";
import RecordBadges, { efficiencyNullReason, formatOdometer } from "@/components/RecordBadges";
import { normalizeDateString } from "@/lib/stats";
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

export default function HistoryPage() {
  const { toast, confirm } = useToast();
  const {
    vehicles,
    selectedVehicleId,
    setSelectedVehicleId,
    addVehicle,
    deleteVehicle,
    updateVehicle,
    loading: vehiclesLoading,
    error: vehiclesError,
    readOnly: vehiclesReadOnly,
  } = useVehicles();
  // 車両一覧の読み込みが終わるまでレコードの読み込みは保留する。
  // vehicles は連鎖計算（オドメーターモードの区間距離・部分給油の燃費）で各車両の方式を知るために渡す
  const {
    records,
    deleteRecord,
    updateRecord,
    loading: recordsLoading,
    error: recordsError,
    readOnly,
  } = useFuelRecords(selectedVehicleId, vehicles[0]?.id, { enabled: !vehiclesLoading, vehicles });
  const selectedVehicle = vehicles.find(v => v.id === selectedVehicleId) ?? null;
  const distanceMode = distanceModeOf(selectedVehicle);

  const [editingId, setEditingId] = useState<string | null>(null);
  const form = useRecordForm();
  const [saving, setSaving] = useState(false);

  const [movingId, setMovingId] = useState<string | null>(null);
  // 進行中の操作（削除・移動）の対象レコードID。二重クリック防止用
  const [busyId, setBusyId] = useState<string | null>(null);

  const [sortType, setSortType] = useState<"date" | "created_at">("date");

  // 年・月フィルタ
  const [filterYear, setFilterYear] = useState<string>("all");
  const [filterMonth, setFilterMonth] = useState<string>("all");

  // 車両を切り替えたら、開いている編集フォームと「移動先の選択」を閉じ、年・月フィルタも解除する。
  // 開いたままだと、切り替え前の車両の記録を更新してしまうため。
  // （エフェクトではなく「前回の値を state に保持してレンダー中に調整する」React 推奨パターン）
  const [formVehicleId, setFormVehicleId] = useState(selectedVehicleId);
  if (formVehicleId !== selectedVehicleId) {
    setFormVehicleId(selectedVehicleId);
    setEditingId(null);
    setMovingId(null);
    setFilterYear("all");
    setFilterMonth("all");
  }
  // 距離の入力方式を切り替えたら、開いている編集フォームを閉じる（入力欄が走行距離 / オドメーターで合わなくなるため）
  const [formDistanceMode, setFormDistanceMode] = useState(distanceMode);
  if (formDistanceMode !== distanceMode) {
    setFormDistanceMode(distanceMode);
    setEditingId(null);
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

  const isLoading = vehiclesLoading || recordsLoading;

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
      await updateRecord(recordId, { vehicle_id: targetVehicleId });
      setMovingId(null);
      toast(`「${targetName}」へ移動しました`, { type: "success" });
    } catch (e) {
      console.error(e);
      toast(e instanceof Error ? e.message : "車両の移動に失敗しました", { type: "error" });
    } finally {
      setBusyId(null);
    }
  };

  // フォーム内で日付を変えたときの「前回のオドメーター」（編集中の記録自身は除く）。
  // records は年・月フィルタ前の、この車両（と表示する未分類）の全記録
  const getPreviousOdometer = useCallback(
    (date: string, excludeRecordId?: string, odometer?: number | null) =>
      previousOdometer(excludeRecordId ? records.filter(r => r.id !== excludeRecordId) : records, { date, odometer }),
    [records]
  );

  // フォーム内で日付を変えたときの「直前に開いている run」（部分給油の合算用。編集中の記録自身は除く）
  const getOpenRun = useCallback(
    (date: string, excludeRecordId?: string, odometer?: number | null) =>
      openRunBefore(excludeRecordId ? records.filter(r => r.id !== excludeRecordId) : records, selectedVehicle, { date, odometer }),
    [records, selectedVehicle]
  );

  const startEditing = (record: FuelRecord) => {
    if (readOnly) return;
    form.reset(record, {
      vehicle: selectedVehicle,
      previousOdometer: previousOdometer(records, { recordId: record.id }),
      getPreviousOdometer,
      openRun: openRunBefore(records, selectedVehicle, { recordId: record.id }),
      getOpenRun,
    });
    setEditingId(record.id);
    setMovingId(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
  };

  const saveEditing = async () => {
    if (!editingId || saving || !form.isValid) return;
    setSaving(true);
    try {
      await updateRecord(editingId, form.toRecord());
      setEditingId(null);
      toast("記録を更新しました", { type: "success" });
    } catch (err) {
      console.error(err);
      toast(err instanceof Error ? err.message : "保存に失敗しました", { type: "error" });
    } finally {
      setSaving(false);
    }
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
        <header className="flex items-center justify-between py-4 mb-2 sticky top-0 bg-black/80 backdrop-blur-md z-10 w-full">
          <div className="flex items-center gap-4">
            <Link href="/app" aria-label="ホームに戻る" className="p-2 bg-gray-900 rounded-full hover:bg-gray-800 transition">
              <ArrowLeft className="w-5 h-5 text-gray-300" aria-hidden="true" />
            </Link>
            <h1 className="text-xl md:text-2xl font-bold">給油履歴</h1>
          </div>
          
          <div className="flex items-center gap-3">
            <Link href="/stats" aria-label="グラフを見る" className="p-2 bg-gray-900 rounded-full hover:bg-gray-800 transition text-gray-300 group flex items-center gap-2">
              <span className="hidden sm:inline text-sm font-bold pr-1">グラフを見る</span>
              <BarChart3 className="w-5 h-5 text-blue-400" aria-hidden="true" />
            </Link>

            <SignedOut>
              <SignInButton forceRedirectUrl="/history">
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

        {/* データ取得エラー / 閲覧専用の表示 */}
        {(vehiclesError || recordsError) && (
          <p role="alert" className="text-xs text-red-400 mb-2 px-1">{vehiclesError || recordsError}</p>
        )}
        {readOnly && (
          <p role="status" className="text-[11px] text-amber-400/90 mb-2 px-1">閲覧専用（クラウド接続待ち）</p>
        )}

        {/* 車両セレクター & CSV出力ボタン */}
        <div className="flex items-center justify-between gap-4 mb-6 w-full">
          {/* 左側：車両セレクター */}
          <div className="flex-grow min-w-0">
            {vehiclesLoading ? (
              <div className="w-full">
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
                readOnly={vehiclesReadOnly}
                className="w-full"
              />
            )}
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
                  editingId === rec.id ? (
                    <div key={`edit-${rec.id}`} className="bg-gray-800 border border-blue-500 ring-1 ring-blue-500 rounded-2xl p-5 relative">
                      <EditFuelRecordForm
                        form={form}
                        onCancel={cancelEditing}
                        onSave={saveEditing}
                        saving={saving}
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

                      <RecordBadges record={rec} className="mb-2" />

                      <div className="grid grid-cols-2 gap-2 text-sm bg-black/20 p-3 rounded-lg">
                        <div className="flex justify-between border-r border-gray-800 pr-2">
                          <span className="text-gray-500 text-xs">給油量</span>
                          <span className="font-mono text-gray-300">{rec.fuel_amount ?? "--"} L</span>
                        </div>
                        <div className="flex justify-between pl-2">
                          <span className="text-gray-500 text-xs">{distanceMode === "odometer" ? "区間" : "走行"}</span>
                          <span className="font-mono text-gray-300">{rec.total_distance ?? "--"} km</span>
                        </div>
                        {distanceMode === "odometer" && (
                          <p className="col-span-2 text-xs font-mono text-gray-400">{formatOdometer(rec.odometer)}</p>
                        )}
                      </div>

                      {rec.memo && (
                        <p className="mt-2 text-xs text-gray-400 truncate" title={rec.memo}>
                          <span className="sr-only">メモ: </span>{rec.memo}
                        </p>
                      )}

                      <div className="mt-3 flex items-center gap-2 text-xs text-gray-500 pr-24">
                        <MapPin className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate" title={rec.gas_station || undefined}>
                          {rec.gas_station || "SS不明"}
                        </span>
                      </div>

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