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

/** グループリストの下に添える補足の文（左右 16px、13px 未満の `text-sub`） */
export const captionClass = "px-4 text-xs leading-relaxed text-sub";

/** 注意書き（追記のみなど）。`text-warn` */
export const noticeClass = "px-4 text-xs leading-relaxed text-warn";

/** グループリストの中に置く、行以外の領域（プレビュー・フォームなど）の余白 */
export const panelClass = "px-4 py-3.5";

const BUTTON_BASE =
  "flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50";

/** 主操作ボタン（復元する・取り込む） */
export const primaryButtonClass = `${BUTTON_BASE} bg-accent text-ground hover:bg-accent/90`;

/** 副操作ボタン（キャンセル） */
export const secondaryButtonClass = `${BUTTON_BASE} border border-border bg-surface-2 text-ink hover:bg-line`;

/** テキスト入力 */
export const inputClass =
  "h-11 w-full min-w-0 rounded-xl border border-border bg-ground px-3 text-base text-ink placeholder:text-faint transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60 sm:text-sm";
