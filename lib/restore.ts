/**
 * バックアップ（JSON の復元・CSV の取り込み）を既存データへ追記する実行手順。
 * 設定画面の BackupPanel（復元）と ImportPanel（インポート）で共有する。
 *
 * 副作用はすべて引数の deps（useVehicles / useFuelRecords の関数）経由で行う。React に依存しないので node で単体テストできる。
 * 計画（planRestore）と vehicle_id の確定（finalizeRestoreRecords）は lib/backup.ts の純粋関数。
 */

import { finalizeRestoreRecords, planRestore, type FuelLensBackup } from "@/lib/backup";
import type { FuelRecord, Vehicle, VehicleSettings, VehicleType } from "@/lib/types";

// ------------------------------------------------------------------
// 依存（データフックの関数）の型
// ------------------------------------------------------------------

/** 全車両の記録を取得する（useFuelRecords().fetchAllRecords） */
export type FetchAllRecords = () => Promise<FuelRecord[]>;

/** 車両をまとめて追加する。戻り値は items と同じ順序の作成済み車両（useVehicles().addVehicles） */
export type AddVehicles = (items: ({ name: string; type: VehicleType } & VehicleSettings)[]) => Promise<Vehicle[]>;

/**
 * 記録をまとめて追加する（useFuelRecords().addRecords）。戻り値は追加した件数。
 * 途中で失敗したときは、それまでに追加した件数を含む日本語メッセージの Error を投げる。
 */
export type AddRecords = (
  items: Omit<FuelRecord, "id">[],
  options?: { onProgress?: (done: number, total: number) => void }
) => Promise<number>;

/** 設定画面のパネルが受け取るデータ操作 */
export interface RestoreDataAccess {
  fetchAllRecords: FetchAllRecords;
  addVehicles: AddVehicles;
  addRecords: AddRecords;
}

export interface RestoreDeps extends RestoreDataAccess {
  /** 既存の車両一覧（先頭 = 既定車両） */
  vehicles: readonly Pick<Vehicle, "id" | "name" | "type">[];
}

// ------------------------------------------------------------------
// 進捗・結果・エラー
// ------------------------------------------------------------------

export type RestoreProgress =
  | { phase: "prepare"; done?: undefined; total?: undefined }
  /** total = 追加する車両の台数 */
  | { phase: "vehicles"; done?: undefined; total: number }
  /** done / total = 追加済み / 追加する記録の件数 */
  | { phase: "records"; done: number; total: number };

export type RestoreResult = {
  /** 追加した車両の台数 */
  vehiclesAdded: number;
  /** 追加した記録の件数 */
  recordsAdded: number;
  /** 重複でスキップした記録の件数 */
  skipped: number;
  /** 書き込み（addVehicles / addRecords）を 1 回でも行った */
  changed: boolean;
};

/**
 * executeRestore の失敗。message は元のエラーのメッセージ（addRecords の「N 件を追加したところで中断しました。…」など）を
 * そのまま引き継ぐ。元が Error でない・メッセージが空なら空文字（表示側で既定の文言にする）。
 */
export class RestoreError extends Error {
  /**
   * 書き込みを 1 回でも始めていた。途中まで追加済みの可能性があるので、件数の表示などを読み込み直すべき
   */
  readonly changed: boolean;

  constructor(cause: unknown, changed: boolean) {
    super(cause instanceof Error ? cause.message : "", { cause });
    this.name = "RestoreError";
    this.changed = changed;
  }
}

/** ユーザー向けのエラーメッセージ。Error のメッセージがあればそれ、無ければ fallback */
export function errorText(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

// ------------------------------------------------------------------
// 実行
// ------------------------------------------------------------------

/**
 * バックアップを既存データへ追記する。
 *
 * 1. 全記録を取り直し、最新の状態で planRestore する（確認中に別タブ等でデータが変わっていても二重登録しないため）
 * 2. 新規車両を addVehicles で追加する（距離の入力方式・既定の燃料種別も引き継ぐ）
 * 3. 作成された車両の ID で記録の vehicle_id を確定する（finalizeRestoreRecords）
 * 4. 記録を addRecords で追加する（チャンク単位の進捗を onProgress へ流す）
 *
 * 進捗は prepare → vehicles（新規車両があるとき）→ records（追加する記録があるとき。done = 0 から）の順に通知する。
 *
 * @throws RestoreError。途中で失敗すると追加済みの分は残る（もう一度実行すると、追加済みの分は重複としてスキップされる）
 */
export async function executeRestore(
  backup: FuelLensBackup,
  deps: RestoreDeps,
  onProgress?: (p: RestoreProgress) => void
): Promise<RestoreResult> {
  const { vehicles, fetchAllRecords, addVehicles, addRecords } = deps;
  let changed = false;
  try {
    onProgress?.({ phase: "prepare" });
    const existing = await fetchAllRecords();
    const plan = planRestore(backup, vehicles, existing);

    // プロトタイプを持たないオブジェクトにする（"__proto__" などの車両IDでも対応が失われないように）
    const createdIdMap = Object.create(null) as Record<string, string>;
    if (plan.vehiclesToCreate.length > 0) {
      onProgress?.({ phase: "vehicles", total: plan.vehiclesToCreate.length });
      changed = true;
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
    let recordsAdded = 0;
    if (records.length > 0) {
      onProgress?.({ phase: "records", done: 0, total: records.length });
      changed = true;
      recordsAdded = await addRecords(records, {
        onProgress: (done, total) => onProgress?.({ phase: "records", done, total }),
      });
    }

    return {
      vehiclesAdded: plan.vehiclesToCreate.length,
      recordsAdded,
      skipped: plan.counts.recordsSkipped,
      changed,
    };
  } catch (e) {
    throw new RestoreError(e, changed);
  }
}

// ------------------------------------------------------------------
// 表示用の文言
// ------------------------------------------------------------------

/** "restore" = JSON バックアップからの復元、"import" = CSV の取り込み */
export type RestoreKind = "restore" | "import";

const KIND_TEXT: Record<RestoreKind, { done: string; failed: string; retry: string }> = {
  restore: {
    done: "復元しました",
    failed: "復元に失敗しました",
    retry: "もう一度ファイルを選ぶと、残りを復元できます。",
  },
  import: {
    done: "取り込みました",
    failed: "取り込みに失敗しました",
    retry: "もう一度ファイルを選ぶと、残りを取り込めます。",
  },
};

export function restoreProgressText(p: RestoreProgress): string {
  switch (p.phase) {
    case "prepare":
      return "準備中…";
    case "vehicles":
      return `車両を追加中…（${p.total} 台）`;
    case "records":
      return `記録を追加中… ${p.done} / ${p.total} 件`;
  }
}

export function restoreSuccessText(kind: RestoreKind, result: RestoreResult): string {
  const skippedNote = result.skipped > 0 ? `（重複 ${result.skipped} 件はスキップ）` : "";
  return `${KIND_TEXT[kind].done}: 車両 ${result.vehiclesAdded} 台・記録 ${result.recordsAdded} 件を追加${skippedNote}`;
}

/** 失敗時の文言。途中まで追加済みの可能性があるため、もう一度ファイルを選べば残りを追加できることを添える */
export function restoreFailureText(kind: RestoreKind, e: unknown): string {
  return `${errorText(e, KIND_TEXT[kind].failed)}\n${KIND_TEXT[kind].retry}`;
}
