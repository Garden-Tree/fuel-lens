/**
 * PWA ショートカット・Web Share Target の `?action=` の判定と、スキャンメニューの可否（純粋関数）。
 * 実行は lib/scan/useShortcutActions.ts（`action` が付くたびに 1 回、実行後に URL から消す）。
 *
 * - `scan`: manifest のショートカット「スキャン」・他の画面のスキャンメニュー「撮影する」（カメラを開く）
 * - `album`: 他の画面のスキャンメニュー「アルバムから選ぶ」（ファイル選択を開く。カメラは起動しない）
 * - `manual`: manifest のショートカット「手動で入力」・他の画面のスキャンメニュー「手動で入力」
 * - `shared`: Service Worker が共有画像を受け取った（`&t=<token>` 付き）
 * - `share-unavailable`: SW 未準備・画像なしで共有を受け取れなかった
 *
 * /app を表示中のスキャンメニューは URL を経由せず、components/ScanActions.tsx で登録した処理を直接呼ぶ。
 */

export const SHORTCUT_ACTIONS = ["scan", "album", "manual", "shared", "share-unavailable"] as const;
export type ShortcutAction = (typeof SHORTCUT_ACTIONS)[number];

/** 記録の入口（撮影 / アルバム / 手動入力） */
export type EntryAction = "scan" | "album" | "manual";

/**
 * 撮影・アルバム・手動入力を今は始められない理由。
 * - loading: 画面の準備中（マウント前・車両と記録の読み込み中）
 * - scanning: スキャン（圧縮・解析）中
 * - reviewing: 確認シートを表示中
 * - readOnly: 閲覧専用（手動入力だけ）
 */
export type EntryBlockReason = "loading" | "scanning" | "reviewing" | "readOnly";

/** 各アクションを判定・実行してよいか */
export type ShortcutReadiness = {
  /** 撮影・アルバム・手動入力の可否を判定できる（マウント済み・読み込み完了） */
  evaluable: boolean;
  /** 撮影・アルバムを始められない理由（null なら始められる） */
  scanBlock: EntryBlockReason | null;
  /** 手動入力を始められない理由（null なら始められる） */
  manualBlock: EntryBlockReason | null;
  /** 共有画像を取り出してよい（スキャンと同じ条件 + ログイン状態の確定） */
  shared: boolean;
  /** 案内（share-unavailable）を出してよい */
  notice: boolean;
};

/** 共有画像を受け取れなかったときの案内 */
export const SHARE_UNAVAILABLE_MESSAGE =
  "共有された画像を受け取れませんでした。もう一度お試しください（インストール直後は数秒かかることがあります）";

/** 手動入力を始めるとき、開いているフォームを破棄してよいかの確認文 */
export const DISCARD_FORM_CONFIRM_MESSAGE = "入力中の内容を破棄して新しく入力しますか？";

/**
 * 画面の状態から、各アクションの可否を決める。
 * - 撮影・アルバムは読み込み完了かつ解析中・確認中でないこと
 * - 手動入力は読み込み完了かつ解析中・確認中・閲覧専用でないこと（確認シートの裏でフォームを開かない）
 * - 共有画像はスキャンと同じ条件がそろうまで待ち、さらにログイン状態の確定を待つ（401 時の案内文を正しく出すため）
 * - 案内（share-unavailable）はマウント後ならいつでもよい
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
  const evaluable = state.mounted && !state.dataLoading;
  const busy: EntryBlockReason | null = !evaluable
    ? "loading"
    : state.scanning
      ? "scanning"
      : state.reviewing
        ? "reviewing"
        : null;
  const scanBlock = busy;
  const manualBlock = busy ?? (state.readOnly ? "readOnly" : null);
  return {
    evaluable,
    scanBlock,
    manualBlock,
    shared: scanBlock === null && state.authLoaded,
    notice: state.mounted,
  };
}

/** URL の action を始められなかったときの toast の文言 */
export function blockedActionMessage(action: EntryAction, reason: EntryBlockReason): string {
  const what = action === "scan" ? "撮影を開始できません" : action === "album" ? "アルバムを開けません" : "手動入力はできません";
  switch (reason) {
    case "scanning":
      return `読み取り中のため${what}`;
    case "reviewing":
      return `読み取り結果の確認中のため${what}`;
    case "readOnly":
      return `閲覧専用のため${what}`;
    case "loading":
      return `読み込み中のため${what}`;
  }
}

/** スキャンメニュー（/app 表示中）の各項目の可否と、押せない理由の 1 行 */
export type ScanMenuAvailability = {
  canScan: boolean;
  canManual: boolean;
  /** 押せない項目があるときの短い説明。すべて押せるなら null */
  disabledReason: string | null;
};

const MENU_REASON: Record<EntryBlockReason, string> = {
  loading: "読み込み中です。少し待ってから選んでください",
  scanning: "読み取り中です。終わるまで新しい記録は始められません",
  reviewing: "読み取り結果を保存または破棄してから記録してください",
  readOnly: "閲覧専用のため手動入力はできません",
};

export function scanMenuAvailabilityOf(readiness: ShortcutReadiness): ScanMenuAvailability {
  const reason = readiness.scanBlock ?? readiness.manualBlock;
  return {
    canScan: readiness.scanBlock === null,
    canManual: readiness.manualBlock === null,
    disabledReason: reason ? MENU_REASON[reason] : null,
  };
}

/** `?action=` の判定結果 */
export type ShortcutResolution =
  /** 実行する */
  | { type: "run"; action: ShortcutAction }
  /** 判定できるまで待つ（読み込み中など）。URL はそのまま */
  | { type: "wait" }
  /** 今は実行できないので取り下げる（URL から消し、理由を toast で伝える）。後から勝手に実行しない */
  | { type: "drop"; message: string };

/**
 * `?action=` の値から、いま実行するアクションを決める。
 * - 対応していない値・無し: null（何もしない。URL も書き換えない）
 * - 撮影・アルバム・手動入力: 判定できるまで待ち、できない理由（解析中・確認中・閲覧専用）があれば取り下げる
 * - 共有画像: 条件がそろうまで待つ（取り下げない。SW から受け取った画像を落とさないため）
 * - 案内: マウント後に実行
 */
export function resolveShortcutAction(
  action: string | null | undefined,
  readiness: ShortcutReadiness
): ShortcutResolution | null {
  switch (action) {
    case "scan":
    case "album":
    case "manual": {
      if (!readiness.evaluable) return { type: "wait" };
      const block = action === "manual" ? readiness.manualBlock : readiness.scanBlock;
      return block ? { type: "drop", message: blockedActionMessage(action, block) } : { type: "run", action };
    }
    case "shared":
      return readiness.shared ? { type: "run", action } : { type: "wait" };
    case "share-unavailable":
      return readiness.notice ? { type: "run", action } : { type: "wait" };
    default:
      return null;
  }
}
