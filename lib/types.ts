/**
 * ドメインの型と定数（記録・車両・燃料種別・距離の入力方式）。
 *
 * 依存のないモジュール（import なし）。純粋なモジュール（fillChain / backup / csv / stats / importers など）と
 * フック（useFuelRecords / useVehicles / useRecordForm）の両方がここから型を参照する。
 */

// ------------------------------------------------------------------
// 燃料種別・距離の入力方式・車両の種別
// ------------------------------------------------------------------

/** 燃料種別 */
export type FuelType = "regular" | "premium" | "diesel" | "other";

/** 燃料種別の一覧（UI のセレクトの並び順。/api/analyze の応答スキーマの enum にも使う） */
export const FUEL_TYPES: readonly FuelType[] = ["regular", "premium", "diesel", "other"];

/** 燃料種別の表示名（履歴カードのバッジにもそのまま使える短い名前） */
export const FUEL_TYPE_LABELS: Readonly<Record<FuelType, string>> = {
  regular: "レギュラー",
  premium: "ハイオク",
  diesel: "軽油",
  other: "その他",
};

/** 車両の距離の入力方式。trip = トリップメーターの区間距離、odometer = 積算距離の差分 */
export type DistanceMode = "trip" | "odometer";

/** 車両の種別 */
export type VehicleType = "car" | "bike";

// ------------------------------------------------------------------
// 給油記録
// ------------------------------------------------------------------

export type FuelRecord = {
  id: string;
  date: string;
  /**
   * 区間距離 (km)。トリップモードの車両では入力値、オドメーターモードの車両では odometer の差分から
   * 導出した値（useFuelRecords が読み取り時に applyFillChain で上書きする）。
   */
  total_distance: number | null;
  fuel_amount: number | null;
  gas_station: string | null;
  price_per_unit: number | null;
  total_cost: number | null;
  /** 燃費 (km/L)。useFuelRecords が読み取り時に applyFillChain で再計算した値（部分給油は null） */
  fuel_efficiency: number | null;
  vehicle_id?: string | null;
  created_at?: string | null;
  /** 給油時の積算距離 (km)。オドメーターモードの車両では必須入力（0004 で追加） */
  odometer?: number | null;
  /** 満タン給油か。省略は true。false は部分給油（0004 で追加） */
  is_full?: boolean;
  /** この給油の前に記録し忘れた給油がある。省略は false。true なら連鎖を切る（0004 で追加） */
  missed_previous?: boolean;
  /** 燃料種別。null / 省略は未指定（0004 で追加） */
  fuel_type?: FuelType | null;
  /** メモ（200 文字まで）。null / 省略はなし（0004 で追加） */
  memo?: string | null;
  /**
   * 導出値（保存しない。DB・localStorage・バックアップ・CSV には書かない）: この記録が満タン給油で閉じた走行区間（run）の
   * Σ区間距離 (km)。applyFillChain が燃費の出た記録にだけ付ける。統計（lib/stats.ts の summarize）が run 単位で集計するのに使う
   */
  run_distance?: number;
  /** 導出値（保存しない）: 同じ run の Σ給油量 (L)。run_distance と同じ記録にだけ付く */
  run_fuel?: number;
  /** 導出値（保存しない）: 同じ run の Σ支払総額 (円)。run 内に支払総額の無い記録があれば null */
  run_cost?: number | null;
};

/** fuel_records に 0004 で追加した列 */
export type NewRecordField = "odometer" | "is_full" | "missed_previous" | "fuel_type" | "memo";

/** 保存時に addRecord / updateRecord へ渡す形（フォームの toRecord の戻り値） */
export type RecordInput = Omit<FuelRecord, "id" | "vehicle_id" | "created_at">;

// ------------------------------------------------------------------
// 車両
// ------------------------------------------------------------------

export type Vehicle = {
  id: string;
  user_id: string;
  name: string;
  type: VehicleType;
  created_at?: string;
  /**
   * 距離の入力方式（0004 で追加）。省略・不明は "trip"（トリップメーターの区間距離）。
   * "odometer" なら記録の odometer の差分から区間距離を出す（lib/fillChain.ts）。
   */
  distance_mode?: DistanceMode;
  /** 新規記録の燃料種別の初期値（0004 で追加）。null / 省略は未指定 */
  default_fuel_type?: FuelType | null;
};

/** 車両の設定（距離の入力方式・既定の燃料種別）。省略したキーは変更しない／既定値 */
export type VehicleSettings = {
  distance_mode?: DistanceMode;
  default_fuel_type?: FuelType | null;
};
