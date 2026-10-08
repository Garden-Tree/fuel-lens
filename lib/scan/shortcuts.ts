/**
 * PWA ショートカット・Web Share Target の `?action=` の判定（純粋関数）。
 * 実行は lib/scan/useShortcutActions.ts（1 ページロードにつき最大 1 回、実行後に URL から消す）。
 *
 * - `scan`: manifest のショートカット「スキャン」（カメラ / ファイル選択を開く）
 * - `manual`: manifest のショートカット「手動で入力」
 * - `shared`: Service Worker が共有画像を受け取った（`&t=<token>` 付き）
 * - `share-unavailable`: SW 未準備・画像なしで共有を受け取れなかった
 */

export const SHORTCUT_ACTIONS = ["scan", "manual", "shared", "share-unavailable"] as const;
export type ShortcutAction = (typeof SHORTCUT_ACTIONS)[number];

/** 各アクションを実行してよいか */
export type ShortcutReadiness = {
  scan: boolean;
  manual: boolean;
  shared: boolean;
  notice: boolean;
};

/** 共有画像を受け取れなかったときの案内 */
export const SHARE_UNAVAILABLE_MESSAGE =
  "共有された画像を受け取れませんでした。もう一度お試しください（インストール直後は数秒かかることがあります）";

/**
 * 画面の状態から、各アクションの実行条件を決める。
 * スキャンは読み込み完了かつ解析中・確認中でないこと、手動入力は読み込み完了かつ閲覧専用でないこと。
 * 共有画像はスキャンと同じ条件に加え、ログイン状態の確定を待つ（401 時の案内文を正しく出すため）。
 * 案内（share-unavailable）はマウント後ならいつでもよい。
 */
export function shortcutReadinessOf(state: {
  mounted: boolean;
  /** 車両・記録の読み込み中 */
  dataLoading: boolean;
  /** スキャン（圧縮・解析）中 */
  scanning: boolean;
  /** 確認シートを表示中 */
  reviewing: boolean;
  readOnly: boolean;
  authLoaded: boolean;
}): ShortcutReadiness {
  const scan = state.mounted && !state.dataLoading && !state.scanning && !state.reviewing;
  return {
    scan,
    manual: state.mounted && !state.dataLoading && !state.readOnly,
    shared: scan && state.authLoaded,
    notice: state.mounted,
  };
}

/**
 * `?action=` の値から、いま実行するアクションを決める。
 * - 対応していない値・無し: null（何もしない。URL も書き換えない）
 * - 対応しているが実行条件を満たさない: "wait"（条件がそろうまで待つ）
 * - 実行してよい: そのアクション
 */
export function resolveShortcutAction(
  action: string | null | undefined,
  readiness: ShortcutReadiness
): ShortcutAction | "wait" | null {
  switch (action) {
    case "scan":
      return readiness.scan ? "scan" : "wait";
    case "manual":
      return readiness.manual ? "manual" : "wait";
    case "shared":
      return readiness.shared ? "shared" : "wait";
    case "share-unavailable":
      return readiness.notice ? "share-unavailable" : "wait";
    default:
      return null;
  }
}
