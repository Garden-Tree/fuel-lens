"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { FileJson, FileSpreadsheet, Loader2, Upload } from "lucide-react";

import RestoreCounts from "@/components/RestoreCounts";
import {
  captionClass,
  noticeClass,
  panelClass,
  primaryButtonClass,
  secondaryButtonClass,
  type SettingsBusy,
} from "@/components/settingsUi";
import { GroupedList, ListRow, Section, ValueRow } from "@/components/ui";
import { useToast } from "@/components/Toast";
import type { Vehicle } from "@/lib/types";
import { todayLocalISO } from "@/lib/dates";
import {
  BACKUP_MAX_TEXT_LENGTH,
  backupFilename,
  buildBackup,
  parseBackup,
  planRestore,
  serializeBackup,
  type FuelLensBackup,
  type RestorePlan,
} from "@/lib/backup";
import { buildRecordsCsv, downloadTextFile } from "@/lib/csv";
import { errorText, type RestoreDataAccess } from "@/lib/restore";
import { useRestoreRunner } from "@/lib/useRestoreRunner";

export type { BackupBusy } from "@/components/settingsUi";

export interface BackupPanelProps extends RestoreDataAccess {
  vehicles: Vehicle[];
  /** 車両一覧の読み込み中 */
  loading: boolean;
  /** ログイン中（保存先がクラウド） */
  isSignedIn: boolean;
  /** 閲覧専用（クラウド障害中）。復元を無効化する */
  readOnly: boolean;
  /** 車両一覧の読み込みエラー（あれば復元を無効化する） */
  vehiclesError: string | null;
  /** 変わるたびにデータ概要（記録数）を読み込み直す（復元・インポートの後など） */
  refreshToken?: number;
  /**
   * 復元が終わったとき（成功・失敗とも）に呼ぶ。changed = 書き込みを行った（失敗時は途中まで追加済みの可能性がある）。
   * 設定画面は changed のとき refreshToken を進めてデータ概要を読み込み直す
   */
  onDone?: (changed: boolean) => void;
  /**
   * 設定画面で共有する処理中フラグ（ImportPanel と同時に動かさないため）。
   * null 以外なら、どちらかのパネルで処理中
   */
  busy: string | null;
  setBusy: (busy: SettingsBusy | null) => void;
}

type PendingRestore = {
  fileName: string;
  backup: FuelLensBackup;
  plan: RestorePlan;
};

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
  onDone,
  busy,
  setBusy,
}: BackupPanelProps) {
  const { toast, confirm } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pending, setPending] = useState<PendingRestore | null>(null);
  const { run: runRestore, progress } = useRestoreRunner({
    vehicles,
    fetchAllRecords,
    addVehicles,
    addRecords,
    setBusy,
    toast,
    onDone,
  });

  // データ概要（全車両の記録数）
  const [recordCount, setRecordCount] = useState<number | null>(null);
  const [countError, setCountError] = useState<string | null>(null);

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
  }, [loading, fetchAllRecords, refreshToken]);

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

    // 成功・失敗とも古い計画は破棄する（失敗時は途中まで追加済みの可能性があるため。
    // もう一度ファイルを選ぶと、追加済みの分は重複としてスキップされ、残りだけが計画される）
    await runRestore({ backup: pending.backup, kind: "restore", onSettled: () => setPending(null) });
  };

  const counts = pending?.plan.counts;
  const nothingToRestore = !!counts && counts.vehiclesNew === 0 && counts.recordsNew === 0;

  const spinner = <Loader2 className="h-4 w-4 animate-spin text-sub" aria-hidden="true" />;

  return (
    <div className="flex flex-col gap-5">
      {/* データ概要 */}
      <Section title="データ">
        <GroupedList>
          <ValueRow
            label="車両数"
            value={loading ? <span className="inline-block h-5 w-8 animate-pulse rounded bg-surface-2 align-middle" /> : `${vehicles.length}`}
            unit={loading ? undefined : " 台"}
          />
          <ValueRow
            label="記録数（全車両）"
            value={
              recordCount === null ? (
                countError ? (
                  <span className="font-sans text-sm font-normal text-red-400">取得できませんでした</span>
                ) : (
                  <span className="inline-block h-5 w-10 animate-pulse rounded bg-surface-2 align-middle" />
                )
              ) : (
                recordCount.toLocaleString("ja-JP")
              )
            }
            unit={recordCount !== null ? " 件" : undefined}
          />
          <ValueRow label="保存先" value={isSignedIn ? "クラウド（ログイン中）" : "このブラウザ"} className="[&_.num]:font-sans [&_.num]:text-[15px]" />
        </GroupedList>
        {countError && (
          <p role="alert" className="break-words px-4 text-xs text-red-400">
            {countError}
          </p>
        )}
        {!isSignedIn && (
          <p className={captionClass}>
            未ログインのデータはこのブラウザにだけ保存されています。ブラウザのデータを消すと失われるため、定期的にバックアップしてください。
          </p>
        )}
      </Section>

      {/* バックアップ */}
      <Section title="バックアップ">
        <GroupedList>
          <ListRow
            leading={<FileJson className="h-5 w-5 text-accent" aria-hidden="true" />}
            title="JSONで書き出す"
            subtitle="全車両と全記録。下の「復元」で読み込めます"
            trailing={busy === "json" ? spinner : undefined}
            showChevron={busy !== "json"}
            onClick={handleExportJson}
            disabled={actionsDisabled}
          />
          <ListRow
            leading={<FileSpreadsheet className="h-5 w-5 text-money" aria-hidden="true" />}
            title="全車両のCSVを書き出す"
            subtitle="表計算ソフトで見る用"
            trailing={busy === "csv" ? spinner : undefined}
            showChevron={busy !== "csv"}
            onClick={handleExportCsv}
            disabled={actionsDisabled}
          />
        </GroupedList>
      </Section>

      {/* 復元 */}
      <Section title="復元">
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleFileChange}
          aria-label="バックアップファイルを選択"
        />
        <GroupedList>
          <ListRow
            leading={<Upload className="h-5 w-5 text-warn" aria-hidden="true" />}
            title="バックアップファイルを選ぶ"
            subtitle={`FuelLens の JSON を読み込み、${isSignedIn ? "クラウド" : "このブラウザ"}のデータへ追加します`}
            trailing={busy === "restore-prepare" ? spinner : undefined}
            showChevron={busy !== "restore-prepare"}
            onClick={() => fileInputRef.current?.click()}
            disabled={restoreDisabled}
          />

          {pending && counts && (
            <div className={panelClass}>
              <p className="mb-3 break-all text-xs text-sub">
                {pending.fileName}（{new Date(pending.backup.exportedAt).toLocaleString("ja-JP")} 書き出し・車両{" "}
                {pending.backup.vehicles.length} 台・記録 {pending.backup.records.length} 件）
              </p>
              <RestoreCounts counts={counts} />

              {nothingToRestore && <p className="mt-3 text-xs text-sub">追加される車両・記録はありません。</p>}

              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleRestore}
                  disabled={restoreDisabled || nothingToRestore}
                  className={primaryButtonClass}
                >
                  {busy === "restore" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  復元する
                </button>
                <button
                  type="button"
                  onClick={() => setPending(null)}
                  disabled={busy !== null}
                  className={secondaryButtonClass}
                >
                  キャンセル
                </button>
              </div>
            </div>
          )}
        </GroupedList>
        <p className={noticeClass}>復元は追記のみで既存の記録は削除しません。同じ記録はスキップします。</p>
        {readOnly && (
          <p role="status" className="px-4 text-[11px] text-warn">
            閲覧専用（クラウド接続待ち）のため復元できません
          </p>
        )}
        {progress && (
          <p role="status" aria-live="polite" className="flex items-center gap-2 px-4 text-xs text-ink">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            {progress}
          </p>
        )}
      </Section>
    </div>
  );
}
