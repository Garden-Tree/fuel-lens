/**
 * データアダプタ層のインターフェース。
 *
 * 給油記録・車両の保存先は「未ログイン = localStorage（lib/data/localStore.ts）」と
 * 「ログイン = Supabase（lib/data/cloudStore.ts）」の 2 つ。どちらも同じ RecordStore / VehicleStore を満たすので、
 * 片方の経路だけに操作を足すと型エラーになる（CLAUDE.md の不変条件 2）。
 * フック（useFuelRecords / useVehicles）はストアを選んで呼ぶだけで、保存先ごとの処理を持たない。
 *
 * 障害の分類・閲覧専用の書き込みガード・日本語メッセージへの変換は withOutageHandling、
 * 障害時の表示用キャッシュは withCache（lib/data/withOutage.ts）がクラウドのストアに被せる。
 */

import type { SupabaseOutage } from "../supabase/errors";
import type { FuelRecord, Vehicle, VehicleSettings, VehicleType } from "../types";

/**
 * 記録一覧の範囲。vehicleId の車両の記録と、includeUnclassified なら未分類の記録（vehicle_id null / default-*）。
 * includeUnclassified は既定車両（vehicles[0]）を選択中のときだけ true（lib/data/scope.ts の recordScopeOf）。
 */
export type RecordScope = { vehicleId: string | null; includeUnclassified: boolean };

/**
 * add の入力。id と created_at はストアが決める（created_at を渡しても使わない）。
 * vehicle_id は保存先の車両。ローカルでは null / default-* を既定車両 default-car に置き換え、
 * クラウドでは UUID でなければ保存を拒否する（ログイン中に未分類で保存しない）。
 */
export type NewRecord = Omit<FuelRecord, "id" | "vehicle_id"> & { vehicle_id: string | null };

/** addMany（復元・取り込み）の入力。各記録の vehicle_id と created_at（正規化して）をそのまま使う */
export type RestoredRecord = Omit<FuelRecord, "id">;

/** update の変更内容。既知の列だけを保存する（pickRecordColumns）。渡さなかった列は変えない */
export type RecordPatch = Partial<FuelRecord>;

/** 一括追加の進捗（追加済みの件数 / 全件数） */
export type ProgressCallback = (done: number, total: number) => void;

export interface RecordStore {
  /** 範囲の記録（新しい列は既定値で補完済み。並び順は保証しない） */
  list(scope: RecordScope): Promise<FuelRecord[]>;
  /** 全車両の記録（バックアップ・全車両 CSV・復元の重複判定用。新しい列は補完済み） */
  listAll(): Promise<FuelRecord[]>;
  /** 1 件追加して保存値（補完済み）を返す */
  add(input: NewRecord): Promise<FuelRecord>;
  /**
   * まとめて追加し、追加件数を返す。途中で失敗した場合のクラウドの書き込み済み件数は
   * PartialWriteError（→ withOutageHandling 後は DataError.done）で知らせる
   */
  addMany(inputs: readonly RestoredRecord[], onProgress?: ProgressCallback): Promise<number>;
  update(id: string, patch: RecordPatch): Promise<void>;
  remove(id: string): Promise<void>;
  /** 車両の記録をすべて削除する。includeUnclassified なら未分類の記録も（既定車両の削除用） */
  removeByVehicle(vehicleId: string, options: { includeUnclassified: boolean }): Promise<void>;
}

/** 車両の追加の入力。設定は省略可（トリップ / 未指定）。不明な値は捨てる（sanitizeVehicleSettings） */
export type NewVehicle = { name: string; type: VehicleType } & VehicleSettings;

/** 車両の更新内容。省略したキーは変えない */
export type VehiclePatch = Partial<Pick<Vehicle, "name" | "type">> & VehicleSettings;

export interface VehicleStore {
  /**
   * 車両一覧。先頭が既定車両（クラウドは created_at → id の昇順、ローカルは保存順）。
   * 1 台も無ければ既定車両を返す（ローカルは default-car、クラウドは「メインカー」を作成する）
   */
  list(): Promise<Vehicle[]>;
  add(input: NewVehicle): Promise<Vehicle>;
  /** 入力と同じ順序で作成した車両を返す。途中で失敗した場合の作成済みの車両は DataError.created で知らせる */
  addMany(inputs: readonly NewVehicle[]): Promise<Vehicle[]>;
  update(id: string, patch: VehiclePatch): Promise<void>;
  /** 車両だけを削除する（記録は呼び出し側が先に RecordStore.removeByVehicle で削除する） */
  remove(id: string): Promise<void>;
}

export type DataStores = { records: RecordStore; vehicles: VehicleStore };

/** DataError.code: 閲覧専用中の書き込み */
export const READ_ONLY_CODE = "READ_ONLY";
/** DataError.code: 保存前の検証で拒否した（車両が未確定など） */
export const VALIDATION_CODE = "VALIDATION";

export type DataErrorInit<T = unknown> = {
  status?: number;
  code?: string;
  outage?: SupabaseOutage | null;
  done?: number;
  created?: readonly T[];
  cause?: unknown;
};

/**
 * データ層が投げるエラー。message は画面にそのまま出せる日本語（英語の生エラーは cause と console にだけ残す）。
 * - status: HTTP ステータス（分かれば）
 * - code: PostgreSQL / PostgREST のエラーコード、または READ_ONLY_CODE / VALIDATION_CODE / 認証トークン欠落のコード
 * - outage: 障害（停止・接続不可）なら種別。null は障害以外（権限・制約違反・検証など）
 * - done / created: 一括追加が途中で失敗したときの書き込み済み件数・作成済みの要素
 */
export class DataError<T = unknown> extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly outage: SupabaseOutage | null;
  readonly done: number;
  readonly created: readonly T[];

  constructor(message: string, init: DataErrorInit<T> = {}) {
    super(message, init.cause === undefined ? undefined : { cause: init.cause });
    this.name = "DataError";
    if (typeof init.status === "number") this.status = init.status;
    if (typeof init.code === "string" && init.code) this.code = init.code;
    this.outage = init.outage ?? null;
    this.done = init.done ?? 0;
    this.created = init.created ?? [];
  }
}

/**
 * ストア（生の層）の一括追加が途中で失敗したことを表す。cause が元の失敗（Supabase のエラーなど）。
 * withOutageHandling が DataError（done / created 付き）に変換する。
 */
export class PartialWriteError<T = unknown> extends Error {
  readonly done: number;
  readonly created: readonly T[];

  constructor(cause: unknown, done: number, created: readonly T[] = []) {
    super("partial write", { cause });
    this.name = "PartialWriteError";
    this.done = done;
    this.created = created;
  }
}
