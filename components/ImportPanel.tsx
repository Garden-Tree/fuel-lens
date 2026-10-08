"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { Bike, Car, FileInput, FileSpreadsheet, Loader2 } from "lucide-react";

import { useToast } from "@/components/Toast";
import type { FuelRecord, Vehicle, VehicleSettings, VehicleType } from "@/lib/types";
import {
  BACKUP_MAX_TEXT_LENGTH,
  finalizeRestoreRecords,
  planRestore,
  type FuelLensBackup,
} from "@/lib/backup";
import { fuelioToBackup, isFuelioCsv, parseFuelioCsv, type ParsedFuelio } from "@/lib/importers/fuelio";
import {
  FUELLENS_CSV_DEFAULT_VEHICLE_NAME,
  detectFuelLensCsv,
  fuelLensCsvToBackup,
  parseFuelLensCsv,
  type ParsedFuelLensCsv,
} from "@/lib/importers/fuellensCsv";

export interface ImportPanelProps {
  vehicles: Vehicle[];
  /** 車両一覧の読み込み中 */
  loading: boolean;
  /** ログイン中（保存先がクラウド） */
  isSignedIn: boolean;
  /** 閲覧専用（クラウド障害中）。取り込みを無効化する */
  readOnly: boolean;
  /** 車両一覧の読み込みエラー（あれば取り込みを無効化する） */
  vehiclesError: string | null;
  fetchAllRecords: () => Promise<FuelRecord[]>;
  addVehicles: (items: ({ name: string; type: VehicleType } & VehicleSettings)[]) => Promise<Vehicle[]>;
  addRecords: (
    items: Omit<FuelRecord, "id">[],
    options?: { onProgress?: (done: number, total: number) => void }
  ) => Promise<number>;
  /** 取り込みが終わった（一部でも追加した）ときに呼ぶ。データ概要の再読み込み用 */
  onImported?: () => void;
  /**
   * 設定画面で共有する処理中フラグ（BackupPanel と同時に動かさないため）。
   * null 以外なら、どちらかのパネルで処理中
   */
  busy: string | null;
  setBusy: (busy: ImportBusy | null) => void;
}

export type ImportBusy = "import-prepare" | "import";

type Source = { kind: "fuelio"; parsed: ParsedFuelio } | { kind: "fuellens"; parsed: ParsedFuelLensCsv };

type PendingImport = {
  fileName: string;
  source: Source;
  /** プレビュー用の既存記録（取り込み実行時は最新を取り直す） */
  existing: FuelRecord[];
};

const MAX_VEHICLE_NAME_LENGTH = 50;

function errorText(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

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

const sectionClass = "bg-gray-900 border border-gray-800 rounded-2xl p-5 md:p-6";
const buttonClass =
  "flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold rounded-xl border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed";

export default function ImportPanel({
  vehicles,
  loading,
  isSignedIn,
  readOnly,
  vehiclesError,
  fetchAllRecords,
  addVehicles,
  addRecords,
  onImported,
  busy,
  setBusy,
}: ImportPanelProps) {
  const { toast, confirm } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [progress, setProgress] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingImport | null>(null);
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

    const backup = preview.backup;
    setBusy("import");
    setProgress("準備中…");
    let changed = false;
    try {
      // 確認中に別タブ等でデータが変わっていても二重登録しないよう、最新の状態で計画を立て直す
      const existing = await fetchAllRecords();
      const plan = planRestore(backup, vehicles, existing);

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
        changed = true;
        plan.vehiclesToCreate.forEach((v, i) => {
          const c = created[i];
          if (c) createdIdMap[v.backupId] = c.id;
        });
      }

      const records = finalizeRestoreRecords(plan, createdIdMap);
      let added = 0;
      if (records.length > 0) {
        setProgress(`記録を追加中… 0 / ${records.length} 件`);
        changed = true;
        added = await addRecords(records, {
          onProgress: (done, total) => setProgress(`記録を追加中… ${done} / ${total} 件`),
        });
      }

      setPending(null);
      const skippedNote = plan.counts.recordsSkipped > 0 ? `（重複 ${plan.counts.recordsSkipped} 件はスキップ）` : "";
      toast(`取り込みました: 車両 ${plan.vehiclesToCreate.length} 台・記録 ${added} 件を追加${skippedNote}`, {
        type: "success",
      });
    } catch (e) {
      console.error(e);
      // 途中まで追加済みの可能性があるため、古い計画（件数表示・確認文言）は破棄する。
      // もう一度ファイルを選ぶと、追加済みの分は重複としてスキップされ、残りだけが計画される。
      setPending(null);
      toast(`${errorText(e, "取り込みに失敗しました")}
もう一度ファイルを選ぶと、残りを取り込めます。`, { type: "error" });
    } finally {
      setBusy(null);
      setProgress(null);
      if (changed) onImported?.();
    }
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

  const typeButtonClass = (active: boolean) =>
    `px-3 py-2 rounded-lg font-semibold text-xs flex items-center gap-1.5 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-50 ${
      active ? "bg-blue-600/20 border border-blue-500/30 text-blue-400" : "text-gray-500 hover:text-gray-300 border border-transparent"
    }`;

  return (
    <section aria-labelledby="settings-import-title" className={sectionClass}>
      <h2 id="settings-import-title" className="flex items-center gap-2 text-base font-bold mb-2">
        <FileInput className="w-5 h-5 text-cyan-400" aria-hidden="true" />
        インポート
      </h2>
      <p className="text-xs text-gray-400 mb-1">
        Fuelio で書き出した CSV、または FuelLens の CSV（全車両・車両別）を読み込み、
        {isSignedIn ? "クラウド" : "このブラウザ"}のデータへ追加します。
      </p>
      <p className="text-xs text-amber-300/90 mb-4">取り込みは追記のみで既存の記録は削除しません。同じ記録はスキップします。</p>
      {readOnly && (
        <p role="status" className="text-[11px] text-amber-400/90 mb-3">閲覧専用（クラウド接続待ち）のため取り込めません</p>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={handleFileChange}
        aria-label="CSV ファイルを選択"
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={importDisabled}
        className={`${buttonClass} bg-gray-900 hover:bg-gray-800 border-gray-700 text-gray-200 w-full sm:w-auto`}
      >
        {busy === "import-prepare" ? (
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        ) : (
          <FileSpreadsheet className="w-4 h-4 text-cyan-400" aria-hidden="true" />
        )}
        CSV ファイルを選択
      </button>

      {pending && source && (
        <div className="mt-4 bg-black/30 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-400 mb-3 break-all">
            {pending.fileName}（{sourceLabel(source)}・記録 {source.parsed.records.length} 件
            {source.kind === "fuellens" && source.parsed.format === "all"
              ? `・車両 ${source.parsed.vehicleNames.length} 台`
              : ""}
            ）
          </p>

          {needsVehicleInput(source) ? (
            <div className="mb-4">
              <label htmlFor="import-vehicle-name" className="block text-xs text-gray-400 mb-1.5">
                取り込み先の車両{source.kind === "fuelio" ? "（Fuelio の車両名から推定）" : ""}
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
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
                  className="flex-1 min-w-0 bg-gray-950 border border-gray-800 rounded-xl p-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus:border-blue-500 transition disabled:opacity-60"
                />
                <datalist id="import-vehicle-names">
                  {vehicles.map(v => (
                    <option key={v.id} value={v.name} />
                  ))}
                </datalist>
                <div
                  className="flex bg-gray-950 p-0.5 rounded-xl border border-gray-800 flex-shrink-0 self-start sm:self-auto"
                  role="radiogroup"
                  aria-label="車両タイプ"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={vehicleType === "car"}
                    onClick={() => setVehicleType("car")}
                    disabled={busy !== null}
                    className={typeButtonClass(vehicleType === "car")}
                  >
                    <Car className="w-4 h-4" aria-hidden="true" />
                    自動車
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={vehicleType === "bike"}
                    onClick={() => setVehicleType("bike")}
                    disabled={busy !== null}
                    className={typeButtonClass(vehicleType === "bike")}
                  >
                    <Bike className="w-4 h-4" aria-hidden="true" />
                    バイク
                  </button>
                </div>
              </div>
              <p id="import-vehicle-hint" className={`text-[11px] mt-1.5 ${nameError ? "text-red-400" : "text-gray-500"}`}>
                {nameError ??
                  (willMatchExisting
                    ? `既存の車両「${matchedVehicle?.name}」に追加します。`
                    : "名前と種別が一致する既存の車両があればそこへ追加し、無ければ新しい車両を作ります。")}
              </p>
            </div>
          ) : (
            source.kind === "fuellens" && (
              <p className="text-xs text-gray-300 mb-3 break-words">
                車両: {source.parsed.vehicleNames.join("、")}
              </p>
            )
          )}

          {counts && (
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
          )}

          {notes.length > 0 && (
            <ul className="mt-3 text-[11px] text-gray-400 list-disc pl-4 space-y-0.5">
              {notes.map(n => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}

          {nothingToImport && <p className="text-xs text-gray-400 mt-3">追加される車両・記録はありません。</p>}

          <div className="flex flex-col sm:flex-row gap-3 mt-4">
            <button
              type="button"
              onClick={handleImport}
              disabled={importDisabled || !preview || nothingToImport}
              className={`${buttonClass} bg-cyan-700 hover:bg-cyan-600 border-cyan-600 text-white`}
            >
              {busy === "import" && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              取り込む
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
  );
}
