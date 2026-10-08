/** 設定画面（BackupPanel / ImportPanel）で共有する見た目と処理中フラグの型 */

/** BackupPanel の処理中フラグ */
export type BackupBusy = "json" | "csv" | "restore-prepare" | "restore";
/** ImportPanel の処理中フラグ */
export type ImportBusy = "import-prepare" | "import";
/**
 * 設定画面で共有する処理中フラグ（バックアップ・復元・取り込みを同時に動かさないため）。
 * null 以外なら、どちらかのパネルで処理中
 */
export type SettingsBusy = BackupBusy | ImportBusy;

export const sectionClass = "bg-gray-900 border border-gray-800 rounded-2xl p-5 md:p-6";

export const buttonClass =
  "flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold rounded-xl border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed";
