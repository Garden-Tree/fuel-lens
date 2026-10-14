"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ClipboardList, SearchX } from "lucide-react";

import type { FuelRecord } from "@/lib/types";
import EditFuelRecordForm from "@/components/EditFuelRecordForm";
import { useVehicleScope } from "@/lib/useVehicleScope";
import VehicleSelector from "@/components/VehicleSelector";
import { AppFrame, HookErrorLine, PageHeader, ReadOnlyCaption } from "@/components/AppShell";
import { useToast } from "@/components/Toast";
import { useRecordForm } from "@/lib/useRecordForm";
import { useRecordEditing } from "@/lib/useRecordEditing";
import { distanceModeOf } from "@/lib/fillChain";
import { groupByMonth, sumTotalCost, type MonthGroup } from "@/lib/history/groupByMonth";
import {
  ALL,
  MONTH_OPTIONS,
  SORT_LABELS,
  availableYears as listAvailableYears,
  filterByYearMonth,
  recordElementId,
  recordIdFromHash,
  sortRecords,
  type HistorySort,
} from "@/lib/history/recordList";
import {
  RECORD_CSV_EXTRA_HEADERS,
  buildCsv,
  downloadTextFile,
  escapeCsvField,
  formatCsvNumber,
  formatRecordExtraCsvFields,
  toSafeFilenamePart,
} from "@/lib/csv";
import HistoryToolbar, { HistoryToolbarSkeleton } from "./_components/HistoryToolbar";
import RecordRow, { RecordColumnsHeader } from "./_components/RecordRow";
import RecordDetail from "./_components/RecordDetail";

/** 月ごとのまとまりの見出し（左に「2026年9月」、右に「n回・¥合計」） */
function GroupHeader({ group }: { group: Pick<MonthGroup<FuelRecord>, "label" | "count" | "totalCost"> }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 pt-1.5 text-[13px] text-sub">
      <h2 className="font-bold text-ink/80">{group.label}</h2>
      <span>
        <span className="num">{group.count}</span>回・<span className="num">¥{group.totalCost.toLocaleString("ja-JP")}</span>
      </span>
    </div>
  );
}

/** 読み込み中の一覧（月の見出しと行の形だけ） */
function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      {[3, 2].map((rows, g) => (
        <div key={g} className="flex flex-col gap-1.5">
          <div className="mx-4 mt-1.5 h-4 w-20 animate-pulse rounded bg-surface" />
          <div className="divide-y divide-line rounded-2xl bg-surface">
            {Array.from({ length: rows }, (_, i) => (
              <div key={i} className="flex min-h-[60px] items-center gap-3 px-4 py-2.5">
                <div className="h-9 w-8 animate-pulse rounded bg-surface-2" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <div className="h-4 w-2/3 max-w-56 animate-pulse rounded bg-surface-2" />
                  <div className="h-3 w-1/2 max-w-40 animate-pulse rounded bg-surface-2" />
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <div className="h-5 w-12 animate-pulse rounded bg-surface-2" />
                  <div className="h-3 w-14 animate-pulse rounded bg-surface-2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      <span className="sr-only">読み込み中…</span>
    </div>
  );
}

/** 記録が無いときの表示 */
function EmptyState({ filtered, onClear }: { filtered: boolean; onClear: () => void }) {
  const Icon = filtered ? SearchX : ClipboardList;
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl bg-surface px-6 py-14 text-center">
      <Icon className="h-8 w-8 text-faint" aria-hidden="true" />
      <p className="text-[15px] text-ink">{filtered ? "条件に一致する記録がありません" : "この車両の履歴はありません"}</p>
      {filtered ? (
        <button
          type="button"
          onClick={onClear}
          className="h-10 rounded-xl px-3 text-sm font-bold text-accent transition-colors hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          絞り込みを解除
        </button>
      ) : (
        <p className="text-[13px] text-sub">レシートとメーターを撮影すると、ここに給油の記録が並びます</p>
      )}
    </div>
  );
}

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

  // 開いている行（明細と操作を出している記録）
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // 進行中の操作（削除・移動）の対象レコードID。二重クリック防止用
  const [busyId, setBusyId] = useState<string | null>(null);

  const [sortType, setSortType] = useState<HistorySort>("date");

  // 年・月フィルタ
  const [filterYear, setFilterYear] = useState<string>(ALL);
  const [filterMonth, setFilterMonth] = useState<string>(ALL);

  // 車両を切り替えたら開いている行を閉じ、年・月フィルタも解除する（方式の切り替えでは解除しない）
  // （エフェクトではなく「前回の値を state に保持してレンダー中に調整する」React 推奨パターン）
  const [filterVehicleId, setFilterVehicleId] = useState(selectedVehicleId);
  if (filterVehicleId !== selectedVehicleId) {
    setFilterVehicleId(selectedVehicleId);
    setExpandedId(null);
    setFilterYear(ALL);
    setFilterMonth(ALL);
  }

  const availableYears = useMemo(() => listAvailableYears(records), [records]);

  // 選択中の年が記録から消えた（最後の1件を削除した等）場合は「すべての年」として扱う。
  // そのままだとチップは「すべての年」と表示されるのに絞り込みが残り、解除できなくなるため。
  const effectiveYear = availableYears.includes(filterYear) ? filterYear : ALL;
  const effectiveMonth = MONTH_OPTIONS.includes(filterMonth) ? filterMonth : ALL;
  const filtered = effectiveYear !== ALL || effectiveMonth !== ALL;

  const sortedRecords = useMemo(
    () => sortRecords(filterByYearMonth(records, effectiveYear, effectiveMonth), sortType),
    [records, effectiveYear, effectiveMonth, sortType]
  );

  // 給油日順は月ごとにまとめる（年を 1 つに絞り込んでいれば見出しは「9月」）。
  // 登録順は月が前後するので、まとめずに 1 つの一覧にする（日付の欄に月も出す）
  const groups = useMemo<MonthGroup<FuelRecord>[]>(() => {
    if (sortType === "created_at") {
      return sortedRecords.length === 0
        ? []
        : [
            {
              key: "created_at",
              label: SORT_LABELS.created_at,
              count: sortedRecords.length,
              totalCost: sumTotalCost(sortedRecords),
              records: sortedRecords,
            },
          ];
    }
    return groupByMonth(sortedRecords, { shortLabel: effectiveYear !== ALL });
  }, [sortedRecords, sortType, effectiveYear]);

  // ホームなどから `/history#record-<id>` で開かれたら、その行を開いて画面内へスクロールする（読み込み後に 1 回 + hashchange）。
  // - 「処理済み」にするのは、対象の行が見つかって開いたときだけ。車両を切り替えたらやり直す
  // - 現在の車両の記録を読み込み終えても対象が無ければ、トーストで知らせてハッシュを消す（繰り返し発火させない）
  // - 年・月の絞り込みで隠れているなら、絞り込みを解除して開く
  const hashHandledRef = useRef(false);
  // 現在の車両の記録を「読み込み中 → 完了」と観測したか（車両の切り替え直後は古い記録が 1 回描画されるため、これを待つ）
  const sawLoadingRef = useRef(false);
  const latestRef = useRef({ records, isLoading, effectiveYear, effectiveMonth, toast });
  useEffect(() => {
    latestRef.current = { records, isLoading, effectiveYear, effectiveMonth, toast };
  });
  useEffect(() => {
    hashHandledRef.current = false;
    sawLoadingRef.current = false;
  }, [selectedVehicleId]);
  useEffect(() => {
    const openFromHash = (fromHashChange: boolean) => {
      const id = recordIdFromHash(window.location.hash);
      if (!id) return;
      const latest = latestRef.current;
      if (latest.isLoading || !sawLoadingRef.current) return;
      if (!fromHashChange && hashHandledRef.current) return;

      const target = latest.records.find(r => r.id === id);
      if (!target) {
        latest.toast("リンクの記録はこの車両の履歴にありません", { type: "info" });
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
        return;
      }
      hashHandledRef.current = true;
      if (filterByYearMonth([target], latest.effectiveYear, latest.effectiveMonth).length === 0) {
        setFilterYear(ALL);
        setFilterMonth(ALL);
      }
      setExpandedId(id);
      requestAnimationFrame(() => {
        const el = document.getElementById(recordElementId(id));
        el?.scrollIntoView({ block: "center" });
        el?.querySelector<HTMLElement>("button[aria-expanded]")?.focus({ preventScroll: true });
      });
    };
    if (isLoading) sawLoadingRef.current = true;
    const frame = requestAnimationFrame(() => openFromHash(false));
    const onHashChange = () => openFromHash(true);
    window.addEventListener("hashchange", onHashChange);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", onHashChange);
    };
  }, [isLoading, selectedVehicleId, records]);

  // 確認ダイアログを閉じたあと、フォーカスが <body> に落ちていたら、その行の見出しボタンへ戻す
  const restoreRowFocus = (recordId: string) => {
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (active && active !== document.body) return;
      document.getElementById(recordElementId(recordId))?.querySelector<HTMLElement>("button[aria-expanded]")?.focus({ preventScroll: true });
    });
  };

  const handleDelete = async (id: string) => {
    if (busyId || readOnly) return;
    // 確認ダイアログ表示中も busy 扱いにして、同じ行の編集・移動を無効化する
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
      restoreRowFocus(id);
    }
  };

  const handleMoveVehicle = async (recordId: string, targetVehicleId: string) => {
    if (busyId || readOnly) return;
    const targetName = vehicles.find(v => v.id === targetVehicleId)?.name ?? "別の車両";
    // 確認ダイアログ表示中も busy 扱いにして、同じ行の編集・移動を無効化する
    setBusyId(recordId);
    try {
      const ok = await confirm(`この記録を「${targetName}」へ移動しますか？`, { confirmLabel: "移動する" });
      if (!ok) return;
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
      setExpandedId(null);
      toast(`「${targetName}」へ移動しました`, { type: "success" });
    } catch (e) {
      console.error(e);
      toast(e instanceof Error ? e.message : "車両の移動に失敗しました", { type: "error" });
    } finally {
      setBusyId(null);
      restoreRowFocus(recordId);
    }
  };

  const startEditing = (record: FuelRecord) => {
    if (readOnly) return;
    editing.startEditing(record);
    setExpandedId(record.id);
  };

  const toggleRow = (id: string) => {
    // 編集中の行は、フォームのキャンセル / 保存で閉じる（見出しを押しても畳まない）
    if (editing.editingRecordId === id) return;
    setExpandedId(current => (current === id ? null : id));
  };

  const clearFilters = () => {
    setFilterYear(ALL);
    setFilterMonth(ALL);
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
    const filename = `fuellens_${toSafeFilenamePart(currentVehicleName)}_${new Date().toISOString().slice(0, 10)}.csv`;
    downloadTextFile(filename, buildCsv(headers, rows), "text/csv;charset=utf-8;");
  };

  const moveTargets = vehicles.filter(v => v.id !== selectedVehicleId);

  return (
    <AppFrame>
      {/* ヘッダーと車両チップ（車両の読み込み中はスケルトン） */}
      <PageHeader
        title="給油履歴"
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

      {/* データ取得エラー / 閲覧専用の表示 */}
      <HookErrorLine error={hookError} />
      <ReadOnlyCaption show={readOnly} />

      {isLoading ? (
        <>
          <HistoryToolbarSkeleton />
          <ListSkeleton />
        </>
      ) : (
        <>
          <HistoryToolbar
            years={availableYears}
            year={effectiveYear}
            month={effectiveMonth}
            sort={sortType}
            onYearChange={setFilterYear}
            onMonthChange={setFilterMonth}
            onSortChange={setSortType}
            count={sortedRecords.length}
            onExport={exportToCsv}
            disabled={records.length === 0}
          />

          {groups.length === 0 ? (
            <EmptyState filtered={filtered} onClear={clearFilters} />
          ) : (
            <div className="flex flex-col gap-3 lg:gap-5">
              <RecordColumnsHeader distanceMode={distanceMode} />
              {groups.map(group => (
                <section key={group.key} className="flex flex-col gap-1.5">
                  <GroupHeader group={group} />
                  {/* GroupedList は overflow-hidden で行内のメニューが切れるため、同じ見た目の ul を使う */}
                  <ul className="rounded-2xl bg-surface divide-y divide-line">
                    {group.records.map(rec => {
                      const isEditing = editing.editingRecordId === rec.id;
                      return (
                        <RecordRow
                          key={rec.id}
                          record={rec}
                          distanceMode={distanceMode}
                          showMonth={sortType === "created_at"}
                          expanded={isEditing || expandedId === rec.id}
                          onToggle={() => toggleRow(rec.id)}
                        >
                          {isEditing ? (
                            // 行（bg-surface）の中に地の色のくぼみを作り、フォームのグループリストを面として見せる
                            <div className="mx-2 mb-2 rounded-2xl bg-ground p-2">
                              <EditFuelRecordForm
                                form={form}
                                onCancel={editing.cancel}
                                onSave={editing.save}
                                saving={editing.saving}
                                disabled={readOnly}
                              />
                            </div>
                          ) : (
                            <RecordDetail
                              record={rec}
                              distanceMode={distanceMode}
                              moveTargets={moveTargets}
                              readOnly={readOnly}
                              busy={busyId === rec.id}
                              onEdit={() => startEditing(rec)}
                              onMove={vehicleId => handleMoveVehicle(rec.id, vehicleId)}
                              onDelete={() => handleDelete(rec.id)}
                            />
                          )}
                        </RecordRow>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </AppFrame>
  );
}
