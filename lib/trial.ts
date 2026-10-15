/**
 * 未ログインのお試し読み取り（AI スキャン）の定数・文言・画面の判定（純粋関数）。
 * クライアントとサーバーの両方から読むので、依存を持たない（署名付き Cookie は lib/server/analyze/trialCookie.ts）。
 *
 * - サーバー（/api/analyze）は `TRIAL_COOKIE_SECRET` が設定されているときだけ、未ログインでも端末ごとに
 *   TRIAL_MAX_SCANS 回まで読み取りを許可する（署名付き Cookie で回数を数え、IP ごとの 1 日の上限も掛ける）。
 * - 残り回数はレスポンスヘッダー `X-Trial-Remaining` で返る。画面の表示はこれと、アプリ画面のレイアウトが
 *   サーバーで Cookie から読んだ初期値（lib/scan/trialContext.tsx）だけを使う。クライアントの値は表示用で、サーバーは信用しない。
 */

/** 未ログインで AI スキャンを試せる回数（端末 = ブラウザごと） */
export const TRIAL_MAX_SCANS = 3;

/** 使用回数を入れる署名付き Cookie の名前（HttpOnly。JavaScript からは読めない） */
export const TRIAL_COOKIE_NAME = "fuel_lens_trial";

/** 未ログインのリクエストに付く、お試しの残り回数のレスポンスヘッダー */
export const TRIAL_REMAINING_HEADER = "X-Trial-Remaining";

/** 使い切ったとき（401 TRIAL_EXHAUSTED）の文言 */
export const TRIAL_EXHAUSTED_MESSAGE = "お試しの読み取りは3回までです。ログインすると続けて使えます";

/** お試しが無効（`TRIAL_COOKIE_SECRET` 未設定）のときの未ログインの案内（従来どおり） */
export const SIGNED_OUT_SCAN_NOTE = "AIスキャンはログイン後に使えます。手動入力はログインなしでも使えます。";

/** 残り回数の案内 */
export function trialRemainingNote(remaining: number): string {
  return `お試しであと ${remaining} 回読み取れます。ログインすると続けて使えます。`;
}

/** 使い切った後の案内（記録の入口・スキャンメニュー） */
export const TRIAL_EXHAUSTED_NOTE = `${TRIAL_EXHAUSTED_MESSAGE}。手動入力はログインなしでも使えます。`;

/** `X-Trial-Remaining` の値を読む。0〜TRIAL_MAX_SCANS の整数でなければ null（信用しない） */
export function parseTrialRemaining(value: string | null | undefined): number | null {
  if (value == null || !/^\d{1,2}$/.test(value.trim())) return null;
  const n = Number(value.trim());
  return n >= 0 && n <= TRIAL_MAX_SCANS ? n : null;
}

/** お試しの状態（アプリ画面のレイアウトがサーバーで決める初期値と、その後の表示用の写し） */
export type TrialState = {
  /** サーバーでお試しが有効（`TRIAL_COOKIE_SECRET` が設定済み） */
  enabled: boolean;
  /** 残り回数（0〜TRIAL_MAX_SCANS）。無効なら 0 */
  remaining: number;
};

export const TRIAL_DISABLED: TrialState = { enabled: false, remaining: 0 };

/** 記録の入口（撮影・アルバム・ドロップ）の AI スキャンの可否と案内 */
export type ScanAccess = {
  /** AI スキャン（撮影・アルバム・ドロップ）を押せない */
  locked: boolean;
  /** 入口の下に出す 1 行の案内。無ければ null */
  note: string | null;
  /** 案内を注意色で出す（使えないとき） */
  warn: boolean;
  /** 未ログインでお試しを使い切った（ログインの案内を出す） */
  exhausted: boolean;
};

/**
 * ログイン状態とお試しの状態から、AI スキャンの可否と案内を決める。
 * - ログイン中: 常に使える（お試しは関係ない）
 * - 未ログインでお試しが無効: 使えない（従来の「ログイン後に使えます」）
 * - 未ログインで残りがある: 使える（「お試しであと N 回」）
 * - 未ログインで使い切った: 使えない（ログインの案内）
 */
export function scanAccessOf(signedOut: boolean, trial: TrialState): ScanAccess {
  if (!signedOut) return { locked: false, note: null, warn: false, exhausted: false };
  if (!trial.enabled) return { locked: true, note: SIGNED_OUT_SCAN_NOTE, warn: true, exhausted: false };
  if (trial.remaining > 0) {
    return { locked: false, note: trialRemainingNote(trial.remaining), warn: false, exhausted: false };
  }
  return { locked: true, note: TRIAL_EXHAUSTED_NOTE, warn: true, exhausted: true };
}
