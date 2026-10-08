"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Database, Download, FileJson, FileSpreadsheet, Loader2, Upload } from "lucide-react";

import { useToast } from "@/components/Toast";
import type { FuelRecord, Vehicle, VehicleSettings, VehicleType } from "@/lib/types";
import { todayLocalISO } from "@/lib/dates";
import {
  BACKUP_MAX_TEXT_LENGTH,
  backupFilename,
  buildBackup,
  finalizeRestoreRecords,
  parseBackup,
  planRestore,
  serializeBackup,
  type FuelLensBackup,
  type RestorePlan,
} from "@/lib/backup";
import { buildRecordsCsv, downloadTextFile } from "@/lib/csv";

export interface BackupPanelProps {
  vehicles: Vehicle[];
  /** 車両一覧の読み込み中 */
  loading: boolean;
  /** ログイン中（保存先がクラウド） */
  isSignedIn: boolean;
  /** 閲覧専用（クラウド障害中）。復元を無効化する */
  readOnly: boolean;
  /** 車両一覧の読み込みエラー（あれば復元を無効化する） */
  vehiclesError: string | null;
  fetchAllRecords: () => Promise<FuelRecord[]>;
  addVehicles: (items: ({ name: string; type: VehicleType } & VehicleSettings)[]) => Promise<Vehicle[]>;
  addRecords: (
    items: Omit<FuelRecord, "id">[],
    options?: { onProgress?: (done: number, total: number) => void }
  ) => Promise<number>;
  /** 変わるたびにデータ概要（記録数）を読み込み直す（インポート後など） */
  refreshToken?: number;
  /**
   * 設定画面で共有する処理中フラグ（ImportPanel と同時に動かさないため）。
   * null 以外なら、どちらかのパネルで処理中
   */
  busy: string | null;
  setBusy: (busy: BackupBusy | null) => void;
}

export type BackupBusy = "json" | "csv" | "restore-prepare" | "restore";

type PendingRestore = {
  fileName: string;
  backup: FuelLensBackup;
  plan: RestorePlan;
};

function errorText(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

const sectionClass = "bg-gray-900 border border-gray-800 rounded-2xl p-5 md:p-6";
const buttonClass =
  "flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold rounded-xl border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed";

export default function BackupPanel({
  vehicles,
  loading,
  isSignedIn,
  readOnly,
  vehiclesError,
  fetchAllRecords,
  addVehicles,
  addRecords,
  refreshToken = 0,
  busy,
  setBusy,
}: BackupPanelProps) {
  const { toast, confirm } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [progress, setProgress] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingRestore | null>(null);

  // データ概要（全車両の記録数）
  const [recordCount, setRecordCount] = useState<number | null>(null);
  const [countError, setCountError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    fetchAllRecords().then(
      list => {
        if (cancelled) return;
        setRecordCount(list.length);
        setCountError(null);
      },
      (e: unknown) => {
        if (cancelled) return;
        setRecordCount(null);
        setCountError(errorText(e, "記録数を取得できませんでした。"));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [loading, fetchAllRecords, reloadKey, refreshToken]);

  const actionsDisabled = loading || busy !== null;
  const restoreDisabled = actionsDisabled || readOnly || !!vehiclesError || vehicles.length === 0;

  const handleExportJson = async () => {
    if (actionsDisabled) return;
    setBusy("json");
    try {
      const records = await fetchAllRecords();
      const backup = buildBackup(vehicles, records);
      downloadTextFile(backupFilename(), serializeBackup(backup), "application/json;charset=utf-8");
      toast(`車両 ${backup.vehicles.length} 台・記録 ${backup.records.length} 件をバックアップしました`, {
        type: "success",
      });
    } catch (e) {
      console.error(e);
      toast(errorText(e, "バックアップに失敗しました"), { type: "error" });
    } finally {
      setBusy(null);
    }
  };

  const handleExportCsv = async () => {
    if (actionsDisabled) return;
    setBusy("csv");
    try {
      const records = await fetchAllRecords();
      if (records.length === 0) {
        toast("書き出せる記録がありません", { type: "info" });
        return;
      }
      const vehiclesById = new Map(vehicles.map(v => [v.id, v]));
      // 未分類の記録は既定（先頭）車両に表示されているので、その車両名で出力する
      const csv = buildRecordsCsv(records, vehiclesById, vehicles[0]?.name ?? "未分類");
      downloadTextFile(`fuellens_all_${todayLocalISO()}.csv`, csv, "text/csv;charset=utf-8;");
      toast(`${records.length} 件の記録を CSV で書き出しました`, { type: "success" });
    } catch (e) {
      console.error(e);
      toast(errorText(e, "CSV の書き出しに失敗しました"), { type: "error" });
    } finally {
      setBusy(null);
    }
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // 同じファイルを続けて選び直せるようにリセットする
    e.target.value = "";
    if (!file || restoreDisabled) return;

    setPending(null);
    if (file.size > BACKUP_MAX_TEXT_LENGTH) {
      toast("ファイルが大きすぎます。", { type: "error" });
      return;
    }

    setBusy("restore-prepare");
    try {
      let text: string;
      try {
        text = await file.text();
      } catch (readError) {
        // 選択後にファイルが移動・削除された等の DOMException（英語のメッセージ）は画面に出さない
        console.error(readError);
        throw new Error("ファイルを読み込めませんでした。もう一度選択してください。");
      }
      const parsed = parseBackup(text);
      if (!parsed.ok) {
        toast(parsed.error, { type: "error" });
        return;
      }
      const existing = await fetchAllRecords();
      const plan = planRestore(parsed.backup, vehicles, existing);
      setPending({ fileName: file.name, backup: parsed.backup, plan });
    } catch (err) {
      console.error(err);
      toast(errorText(err, "バックアップファイルを読み込めませんでした"), { type: "error" });
    } finally {
      setBusy(null);
    }
  };

  const handleRestore = async () => {
    if (!pending || restoreDisabled) return;
    const { counts } = pending.plan;
    const ok = await confirm(
      `車両 ${counts.vehiclesNew} 台と記録 ${counts.recordsNew} 件を追加します。\n既存の記録は削除・変更されません。`,
      { title: "バックアップから復元", confirmLabel: "復元する" }
    );
    if (!ok) return;

    setBusy("restore");
    setProgress("準備中…");
    try {
      // 確認中に別タブ等でデータが変わっていても二重登録しないよう、最新の状態で計画を立て直す
      const existing = await fetchAllRecords();
      const plan = planRestore(pending.backup, vehicles, existing);

      // プロトタイプを持たないオブジェクトにする（"__proto__" などの車両IDでも対応が失われないように）
      const createdIdMap = Object.create(null) as Record<string, string>;
      if (plan.vehiclesToCreate.length > 0) {
        setProgress(`車両を追加中…（${plan.vehiclesToCreate.length} 台）`);
        // 距離の入力方式・既定の燃料種別も引き継ぐ（未指定のキーは addVehicles が既定値にする）
        const created = await addVehicles(
          plan.vehiclesToCreate.map(v => ({
            name: v.name,
            type: v.type,
            distance_mode: v.distance_mode,
            default_fuel_type: v.default_fuel_type,
          }))
        );
        plan.vehiclesToCreate.forEach((v, i) => {
          const c = created[i];
          if (c) createdIdMap[v.backupId] = c.id;
        });
      }

      const records = finalizeRestoreRecords(plan, createdIdMap);
      let added = 0;
      if (records.length > 0) {
        setProgress(`記録を追加中… 0 / ${records.length} 件`);
        added = await addRecords(records, {
          onProgress: (done, total) => setProgress(`記録を追加中… ${done} / ${total} 件`),
        });
      }

      setPending(null);
      const skippedNote = plan.counts.recordsSkipped > 0 ? `（重複 ${plan.counts.recordsSkipped} 件はスキップ）` : "";
      toast(`復元しました: 車両 ${plan.vehiclesToCreate.length} 台・記録 ${added} 件を追加${skippedNote}`, {
        type: "success",
      });
    } catch (e) {
      console.error(e);
      // 途中まで追加済みの可能性があるため、古い計画（件数表示・確認文言）は破棄する。
      // もう一度ファイルを選ぶと、追加済みの分は重複としてスキップされ、残りだけが計画される。
      setPending(null);
      toast(`${errorText(e, "復元に失敗しました")}
もう一度ファイルを選ぶと、残りを復元できます。`, { type: "error" });
    } finally {
      setBusy(null);
      setProgress(null);
      setReloadKey(k => k + 1);
    }
  };

  const counts = pending?.plan.counts;
  const nothingToRestore = !!counts && counts.vehiclesNew === 0 && counts.recordsNew === 0;

  return (
    <div className="flex flex-col gap-6">
      {/* データ概要 */}
      <section aria-labelledby="settings-summary-title" className={sectionClass}>
        <h2 id="settings-summary-title" className="flex items-center gap-2 text-base font-bold mb-4">
          <Database className="w-5 h-5 text-blue-400" aria-hidden="true" />
          データ概要
        </h2>
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-black/30 rounded-xl p-4">
            <dt className="text-xs text-gray-500">車両数</dt>
            <dd className="text-2xl font-bold font-mono mt-1">
              {loading ? <span className="inline-block w-10 h-7 bg-gray-800 rounded animate-pulse" /> : `${vehicles.length}`}
              <span className="text-xs text-gray-500 font-sans ml-1">台</span>
            </dd>
          </div>
          <div className="bg-black/30 rounded-xl p-4">
            <dt className="text-xs text-gray-500">記録数（全車両）</dt>
            <dd className="text-2xl font-bold font-mono mt-1">
              {recordCount === null ? (
                countError ? (
                  <span className="text-sm text-red-400 font-sans">取得できませんでした</span>
                ) : (
                  <span className="inline-block w-14 h-7 bg-gray-800 rounded animate-pulse" />
                )
              ) : (
                recordCount.toLocaleString("ja-JP")
              )}
              {recordCount !== null && <span className="text-xs text-gray-500 font-sans ml-1">件</span>}
            </dd>
          </div>
          <div className="bg-black/30 rounded-xl p-4">
            <dt className="text-xs text-gray-500">保存先</dt>
            <dd className="text-base font-bold mt-2">{isSignedIn ? "クラウド（ログイン中）" : "このブラウザ"}</dd>
          </div>
        </dl>
        {countError && (
          <p role="alert" className="text-xs text-red-400 mt-3 break-words">{countError}</p>
        )}
        {!isSignedIn && (
          <p className="text-xs text-gray-500 mt-3">
            未ログインのデータはこのブラウザにだけ保存されています。ブラウザのデータを消すと失われるため、定期的にバックアップしてください。
          </p>
        )}
      </section>

      {/* バックアップ */}
      <section aria-labelledby="settings-backup-title" className={sectionClass}>
        <h2 id="settings-backup-title" className="flex items-center gap-2 text-base font-bold mb-2">
          <Download className="w-5 h-5 text-green-400" aria-hidden="true" />
          バックアップ
        </h2>
        <p className="text-xs text-gray-400 mb-4">
          全車両と全記録を書き出します。JSON はこの画面の「復元」で読み込めます。CSV は表計算ソフトでの閲覧用です。
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={handleExportJson}
            disabled={actionsDisabled}
            className={`${buttonClass} bg-blue-600 hover:bg-blue-500 border-blue-500 text-white`}
          >
            {busy === "json" ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <FileJson className="w-4 h-4" aria-hidden="true" />
            )}
            JSON でバックアップ
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={actionsDisabled}
            className={`${buttonClass} bg-gray-900 hover:bg-gray-800 border-gray-700 text-gray-200`}
          >
            {busy === "csv" ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <FileSpreadsheet className="w-4 h-4 text-green-500" aria-hidden="true" />
            )}
            全車両を CSV で書き出し
          </button>
        </div>
      </section>

      {/* 復元 */}
      <section aria-labelledby="settings-restore-title" className={sectionClass}>
        <h2 id="settings-restore-title" className="flex items-center gap-2 text-base font-bold mb-2">
          <Upload className="w-5 h-5 text-amber-400" aria-hidden="true" />
          復元
        </h2>
        <p className="text-xs text-gray-400 mb-1">
          FuelLens の JSON バックアップを読み込み、{isSignedIn ? "クラウド" : "このブラウザ"}のデータへ追加します。
        </p>
        <p className="text-xs text-amber-300/90 mb-4">復元は追記のみで既存の記録は削除しません。同じ記録はスキップします。</p>
        {readOnly && (
          <p role="status" className="text-[11px] text-amber-400/90 mb-3">閲覧専用（クラウド接続待ち）のため復元できません</p>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleFileChange}
          aria-label="バックアップファイルを選択"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={restoreDisabled}
          className={`${buttonClass} bg-gray-900 hover:bg-gray-800 border-gray-700 text-gray-200 w-full sm:w-auto`}
        >
          {busy === "restore-prepare" ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : (
            <Upload className="w-4 h-4" aria-hidden="true" />
          )}
          バックアップファイルを選択
        </button>

        {pending && counts && (
          <div className="mt-4 bg-black/30 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-400 mb-3 break-all">
              {pending.fileName}（{new Date(pending.backup.exportedAt).toLocaleString("ja-JP")} 書き出し・車両{" "}
              {pending.backup.vehicles.length} 台・記録 {pending.backup.records.length} 件）
            </p>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <div className="bg-gray-900 rounded-lg p-2">
                <dt className="text-[11px] text-gray-500">新規車両</dt>
                <dd className="text-lg font-bold font-mono">{counts.vehiclesNew}</dd>
              </div>
              <div className="bg-gray-900 rounded-lg p-2">
                <dt className="text-[11px] text-gray-500">既存に一致</dt>
                <dd className="text-lg font-bold font-mono">{counts.vehiclesMatched}</dd>
              </div>
              <div className="bg-gray-900 rounded-lg p-2">
                <dt className="text-[11px] text-gray-500">追加される記録</dt>
                <dd className="text-lg font-bold font-mono text-green-400">{counts.recordsNew}</dd>
              </div>
              <div className="bg-gray-900 rounded-lg p-2">
                <dt className="text-[11px] text-gray-500">重複でスキップ</dt>
                <dd className="text-lg font-bold font-mono text-gray-400">{counts.recordsSkipped}</dd>
              </div>
            </dl>

            {nothingToRestore && (
              <p className="text-xs text-gray-400 mt-3">追加される車両・記録はありません。</p>
            )}

            <div className="flex flex-col sm:flex-row gap-3 mt-4">
              <button
                type="button"
                onClick={handleRestore}
                disabled={restoreDisabled || nothingToRestore}
                className={`${buttonClass} bg-amber-600 hover:bg-amber-500 border-amber-500 text-white`}
              >
                {busy === "restore" && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                復元する
              </button>
              <button
                type="button"
                onClick={() => setPending(null)}
                disabled={busy !== null}
                className={`${buttonClass} bg-gray-900 hover:bg-gray-800 border-gray-700 text-gray-300`}
              >
                キャンセル
              </button>
            </div>
          </div>
        )}

        {progress && (
          <p role="status" aria-live="polite" className="text-xs text-gray-300 mt-3 flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
            {progress}
          </p>
        )}
      </section>
    </div>
  );
}
