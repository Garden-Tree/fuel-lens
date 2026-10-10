"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { Bike, Car, FileInput, FileSpreadsheet, Loader2 } from "lucide-react";

import RestoreCounts from "@/components/RestoreCounts";
import {
  inputClass,
  noticeClass,
  panelClass,
  primaryButtonClass,
  secondaryButtonClass,
  type SettingsBusy,
} from "@/components/settingsUi";
import { GroupedList, ListRow, SegmentedControl, Section } from "@/components/ui";
import { useToast } from "@/components/Toast";
import type { FuelRecord, Vehicle, VehicleType } from "@/lib/types";
import { BACKUP_MAX_TEXT_LENGTH, planRestore, type FuelLensBackup } from "@/lib/backup";
import { errorText, type RestoreDataAccess } from "@/lib/restore";
import { useRestoreRunner } from "@/lib/useRestoreRunner";
import { fuelioToBackup, isFuelioCsv, parseFuelioCsv, type ParsedFuelio } from "@/lib/importers/fuelio";
import {
  FUELLENS_CSV_DEFAULT_VEHICLE_NAME,
  detectFuelLensCsv,
  fuelLensCsvToBackup,
  parseFuelLensCsv,
  type ParsedFuelLensCsv,
} from "@/lib/importers/fuellensCsv";

export type { ImportBusy } from "@/components/settingsUi";

export interface ImportPanelProps extends RestoreDataAccess {
  vehicles: Vehicle[];
  /** 車両一覧の読み込み中 */
  loading: boolean;
  /** ログイン中（保存先がクラウド） */
  isSignedIn: boolean;
  /** 閲覧専用（クラウド障害中）。取り込みを無効化する */
  readOnly: boolean;
  /** 車両一覧の読み込みエラー（あれば取り込みを無効化する） */
  vehiclesError: string | null;
  /**
   * 取り込みが終わったとき（成功・失敗とも）に呼ぶ。changed = 書き込みを行った（失敗時は途中まで追加済みの可能性がある）。
   * 設定画面は changed のときデータ概要を読み込み直す
   */
  onDone?: (changed: boolean) => void;
  /**
   * 設定画面で共有する処理中フラグ（BackupPanel と同時に動かさないため）。
   * null 以外なら、どちらかのパネルで処理中
   */
  busy: string | null;
  setBusy: (busy: SettingsBusy | null) => void;
}

type Source = { kind: "fuelio"; parsed: ParsedFuelio } | { kind: "fuellens"; parsed: ParsedFuelLensCsv };

type PendingImport = {
  fileName: string;
  source: Source;
  /** プレビュー用の既存記録（取り込み実行時は最新を取り直す） */
  existing: FuelRecord[];
};

const MAX_VEHICLE_NAME_LENGTH = 50;

/** UTF-8 として読み、壊れていれば Shift_JIS（Excel で保存し直した CSV）として読む */
async function readCsvText(file: File): Promise<string> {
  let buf: ArrayBuffer;
  try {
    buf = await file.arrayBuffer();
  } catch (e) {
    // 選択後にファイルが移動・削除された等の DOMException（英語のメッセージ）は画面に出さない
    console.error(e);
    throw new Error("ファイルを読み込めませんでした。もう一度選択してください。");
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    try {
      return new TextDecoder("shift_jis").decode(buf);
    } catch {
      return new TextDecoder("utf-8").decode(buf);
    }
  }
}

/** 車両名の入力が必要な形式か（Fuelio と、車両列の無い履歴画面の CSV） */
function needsVehicleInput(source: Source): boolean {
  return source.kind === "fuelio" || source.parsed.format === "vehicle";
}

function sourceLabel(source: Source): string {
  if (source.kind === "fuelio") return "Fuelio の CSV";
  return source.parsed.format === "all" ? "FuelLens の全車両 CSV" : "FuelLens の車両別 CSV";
}

/** 履歴画面の CSV のファイル名（fuellens_<車両名>_YYYY-MM-DD.csv）から車両名を推測する */
function vehicleNameFromFileName(fileName: string): string {
  const m = /^fuellens_(.+)_\d{4}-\d{2}-\d{2}\.csv$/i.exec(fileName);
  const name = m?.[1]?.replace(/_+/g, " ").trim();
  return name && name !== "vehicle" ? name.slice(0, MAX_VEHICLE_NAME_LENGTH) : FUELLENS_CSV_DEFAULT_VEHICLE_NAME;
}

function findVehicleByName(vehicles: readonly Vehicle[], name: string): Vehicle | undefined {
  const trimmed = name.trim();
  return trimmed ? vehicles.find(v => v.name.trim() === trimmed) : undefined;
}

function toBackup(
  source: Source,
  vehicleName: string,
  vehicleType: VehicleType,
  vehicles: readonly Vehicle[]
): FuelLensBackup {
  if (source.kind === "fuelio") return fuelioToBackup(source.parsed, { vehicleName, vehicleType });
  return fuelLensCsvToBackup(source.parsed, {
    vehicleName,
    vehicleType,
    typeByName: name => findVehicleByName(vehicles, name)?.type,
  });
}

export default function ImportPanel({
  vehicles,
  loading,
  isSignedIn,
  readOnly,
  vehiclesError,
  fetchAllRecords,
  addVehicles,
  addRecords,
  onDone,
  busy,
  setBusy,
}: ImportPanelProps) {
  const { toast, confirm } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pending, setPending] = useState<PendingImport | null>(null);
  const { run: runRestore, progress } = useRestoreRunner({
    vehicles,
    fetchAllRecords,
    addVehicles,
    addRecords,
    setBusy,
    toast,
    onDone,
  });
  const [vehicleName, setVehicleName] = useState("");
  const [vehicleType, setVehicleType] = useState<VehicleType>("car");

  const importDisabled = loading || busy !== null || readOnly || !!vehiclesError || vehicles.length === 0;

  const nameTrimmed = vehicleName.trim();
  const nameError =
    pending && needsVehicleInput(pending.source) && (nameTrimmed === "" || nameTrimmed.length > MAX_VEHICLE_NAME_LENGTH)
      ? `車両名は 1〜${MAX_VEHICLE_NAME_LENGTH} 文字にしてください。`
      : null;

  // 車両名・種別を変えるたびにプレビューを計算し直す（planRestore は純粋関数で件数に比例する程度の計算量）
  const preview = useMemo(() => {
    if (!pending || nameError) return null;
    const backup = toBackup(pending.source, vehicleName, vehicleType, vehicles);
    return { backup, plan: planRestore(backup, vehicles, pending.existing) };
  }, [pending, nameError, vehicleName, vehicleType, vehicles]);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // 同じファイルを続けて選び直せるようにリセットする
    e.target.value = "";
    if (!file || importDisabled) return;

    setPending(null);
    if (file.size > BACKUP_MAX_TEXT_LENGTH) {
      toast("ファイルが大きすぎます。", { type: "error" });
      return;
    }

    setBusy("import-prepare");
    try {
      const text = await readCsvText(file);
      let source: Source;
      if (isFuelioCsv(text)) {
        const parsed = parseFuelioCsv(text);
        if (!parsed.ok) {
          toast(parsed.error, { type: "error" });
          return;
        }
        source = { kind: "fuelio", parsed };
      } else if (detectFuelLensCsv(text)) {
        const parsed = parseFuelLensCsv(text);
        if (!parsed.ok) {
          toast(parsed.error, { type: "error" });
          return;
        }
        source = { kind: "fuellens", parsed };
      } else {
        toast("対応していない CSV です。Fuelio または FuelLens で書き出した CSV を選んでください。", { type: "error" });
        return;
      }
      if (source.parsed.records.length === 0) {
        toast("取り込める記録がありませんでした。", { type: "info" });
        return;
      }

      // 取り込み先の車両名と種別の初期値。同名の既存車両があればその種別に合わせる（そのまま追加先になる）
      let name = "";
      let type: VehicleType = "car";
      if (source.kind === "fuelio") {
        name = source.parsed.vehicleName;
        type = source.parsed.vehicleType;
      } else if (source.parsed.format === "vehicle") {
        name = vehicleNameFromFileName(file.name);
      }
      const match = findVehicleByName(vehicles, name);
      if (match) type = match.type;

      const existing = await fetchAllRecords();
      setVehicleName(name);
      setVehicleType(type);
      setPending({ fileName: file.name, source, existing });
    } catch (err) {
      console.error(err);
      toast(errorText(err, "CSV ファイルを読み込めませんでした"), { type: "error" });
    } finally {
      setBusy(null);
    }
  };

  const handleNameChange = (value: string) => {
    setVehicleName(value);
    // 既存の車両名を選んだ・入力したら、その車両に追加されるよう種別を合わせる
    const match = findVehicleByName(vehicles, value);
    if (match) setVehicleType(match.type);
  };

  const handleImport = async () => {
    if (!pending || !preview || importDisabled || nameError) return;
    const { counts } = preview.plan;
    const ok = await confirm(
      `車両 ${counts.vehiclesNew} 台と記録 ${counts.recordsNew} 件を追加します。\n既存の記録は削除・変更されません。`,
      { title: "CSV から取り込み", confirmLabel: "取り込む" }
    );
    if (!ok) return;

    // 成功・失敗とも古い計画は破棄する（失敗時は途中まで追加済みの可能性があるため。
    // もう一度ファイルを選ぶと、追加済みの分は重複としてスキップされ、残りだけが計画される）
    await runRestore({ backup: preview.backup, kind: "import", onSettled: () => setPending(null) });
  };

  const source = pending?.source;
  const counts = preview?.plan.counts;
  const nothingToImport = !!counts && counts.vehiclesNew === 0 && counts.recordsNew === 0;
  const matchedVehicle = source && needsVehicleInput(source) ? findVehicleByName(vehicles, vehicleName) : undefined;
  const willMatchExisting = !!matchedVehicle && matchedVehicle.type === vehicleType;

  const notes: string[] = [];
  if (source?.kind === "fuelio") {
    const { partial, missed, odometerNotIncreasing, skippedInvalid, skippedOtherTank } = source.parsed.stats;
    if (willMatchExisting && matchedVehicle) {
      if (matchedVehicle.distance_mode === "odometer") {
        notes.push("取り込み先の車両はオドメーター入力方式です。区間距離と燃費は保存後に自動計算されます");
      } else {
        notes.push(
          `既存の車両「${matchedVehicle.name}」はトリップ入力方式のため、取り込んだ記録の区間距離と燃費は計算されません。取り込み後に車両の設定でオドメーター入力方式に切り替えると計算されます`
        );
      }
    } else {
      notes.push("取り込み先の車両はオドメーター入力方式になります。区間距離と燃費は保存後に自動計算されます");
    }
    if (source.parsed.tankCount > 1) {
      notes.push(
        `燃料タンクが ${source.parsed.tankCount} つの車両です。1 本目のタンクの記録だけを取り込みます（走行距離には他の燃料で走った分も含まれます）`
      );
    }
    if (skippedOtherTank > 0) notes.push(`2本目のタンクの記録 ${skippedOtherTank} 件は対象外`);
    if (partial > 0) notes.push(`部分給油 ${partial} 件は燃費なし（次の満タン給油でまとめて計算）`);
    if (missed > 0) notes.push(`給油の記録漏れ（Missed）${missed} 件は走行距離・燃費なし`);
    if (odometerNotIncreasing > 0) {
      notes.push(`積算距離が前回以下の記録 ${odometerNotIncreasing} 件は走行距離・燃費なし`);
    }
    if (skippedInvalid > 0) notes.push(`日付・給油量が読めない ${skippedInvalid} 行は読み飛ばし`);
    notes.push("最初の 1 件は走行距離・燃費なし（前回の積算距離が無いため）");
  } else if (source?.kind === "fuellens") {
    if (source.parsed.stats.skippedInvalid > 0) {
      notes.push(`日付・給油量が読めない ${source.parsed.stats.skippedInvalid} 行は読み飛ばし`);
    }
    if (source.parsed.format === "all") {
      notes.push("車両の種別は同じ名前の既存車両に合わせ、無ければクルマとして追加します");
    }
  }

  const spinner = <Loader2 className="h-4 w-4 animate-spin text-sub" aria-hidden="true" />;
  const preparing = busy === "import-prepare";
  const openPicker = () => fileInputRef.current?.click();
  const destination = isSignedIn ? "クラウド" : "このブラウザ";

  return (
    <Section title="インポート">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={handleFileChange}
        aria-label="CSV ファイルを選択"
      />
      <GroupedList>
        {/* どちらの行も同じファイル選択を開く。CSV の形式は読み込み時に自動判定する */}
        <ListRow
          leading={<FileSpreadsheet className="h-5 w-5 text-accent" aria-hidden="true" />}
          title="Fuelio の CSV を選ぶ"
          subtitle={`Fuelio で書き出した CSV を${destination}のデータへ追加します`}
          trailing={preparing ? spinner : undefined}
          showChevron={!preparing}
          onClick={openPicker}
          disabled={importDisabled}
        />
        <ListRow
          leading={<FileInput className="h-5 w-5 text-money" aria-hidden="true" />}
          title="FuelLens の CSV を選ぶ"
          subtitle="全車両・車両別のどちらも読み込めます"
          trailing={preparing ? spinner : undefined}
          showChevron={!preparing}
          onClick={openPicker}
          disabled={importDisabled}
        />

        {pending && source && (
          <div className={panelClass}>
            <p className="mb-3 break-all text-xs text-sub">
              {pending.fileName}（{sourceLabel(source)}・記録 {source.parsed.records.length} 件
              {source.kind === "fuellens" && source.parsed.format === "all"
                ? `・車両 ${source.parsed.vehicleNames.length} 台`
                : ""}
              ）
            </p>

            {needsVehicleInput(source) ? (
              <div className="mb-4">
                <label htmlFor="import-vehicle-name" className="mb-1.5 block text-xs text-sub">
                  取り込み先の車両{source.kind === "fuelio" ? "（Fuelio の車両名から推定）" : ""}
                </label>
                <div className="flex flex-col gap-2">
                  <input
                    id="import-vehicle-name"
                    type="text"
                    list="import-vehicle-names"
                    value={vehicleName}
                    onChange={e => handleNameChange(e.target.value)}
                    maxLength={MAX_VEHICLE_NAME_LENGTH}
                    disabled={busy !== null}
                    aria-invalid={!!nameError}
                    aria-describedby="import-vehicle-hint"
                    className={inputClass}
                  />
                  <datalist id="import-vehicle-names">
                    {vehicles.map(v => (
                      <option key={v.id} value={v.name} />
                    ))}
                  </datalist>
                  <SegmentedControl
                    aria-label="車両タイプ"
                    value={vehicleType}
                    onChange={setVehicleType}
                    disabled={busy !== null}
                    options={[
                      {
                        value: "car",
                        label: (
                          <span className="flex items-center justify-center gap-1.5">
                            <Car className="h-4 w-4" aria-hidden="true" />
                            自動車
                          </span>
                        ),
                      },
                      {
                        value: "bike",
                        label: (
                          <span className="flex items-center justify-center gap-1.5">
                            <Bike className="h-4 w-4" aria-hidden="true" />
                            バイク
                          </span>
                        ),
                      },
                    ]}
                  />
                </div>
                <p id="import-vehicle-hint" className={`mt-1.5 text-[11px] ${nameError ? "text-red-400" : "text-sub"}`}>
                  {nameError ??
                    (willMatchExisting
                      ? `既存の車両「${matchedVehicle?.name}」に追加します。`
                      : "名前と種別が一致する既存の車両があればそこへ追加し、無ければ新しい車両を作ります。")}
                </p>
              </div>
            ) : (
              source.kind === "fuellens" && (
                <p className="mb-3 break-words text-xs text-ink">車両: {source.parsed.vehicleNames.join("、")}</p>
              )
            )}

            <RestoreCounts counts={counts} notes={notes} />

            {nothingToImport && <p className="mt-3 text-xs text-sub">追加される車両・記録はありません。</p>}

            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleImport}
                disabled={importDisabled || !preview || nothingToImport}
                className={primaryButtonClass}
              >
                {busy === "import" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                取り込む
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
      <p className={noticeClass}>取り込みは追記のみで既存の記録は削除しません。同じ記録はスキップします。</p>
      {readOnly && (
        <p role="status" className="px-4 text-[11px] text-warn">
          閲覧専用（クラウド接続待ち）のため取り込めません
        </p>
      )}
      {progress && (
        <p role="status" aria-live="polite" className="flex items-center gap-2 px-4 text-xs text-ink">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          {progress}
        </p>
      )}
    </Section>
  );
}
