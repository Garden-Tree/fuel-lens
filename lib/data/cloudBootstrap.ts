/**
 * ログイン後のクラウドの初期化: ローカルデータの移行（migrateLocalData）→ 既定車両の確保（ensureDefaultVehicle）。
 *
 * useVehicles と useFuelRecords は、クラウドから一覧を読む前にこれを await する。
 * - タブ内で userId ごとに 1 回だけ実行する（同時に呼ばれたら同じ Promise を返す）。完了後の呼び出しは結果をそのまま返す
 * - ただし移行するローカルデータが残っていれば（ログアウト中に記録した・前回の移行が失敗した）やり直す。
 *   移行が障害以外の理由で失敗した直後（30 秒以内）は、退避⇄復元を繰り返さないよう同じ結果を返す
 *   （障害バナーの「再試行」は force: true で、この 30 秒の使い回しを飛ばして最初からやり直す）
 * - 移行の失敗のうち、障害（停止・接続不可）はそのまま投げる（呼び出し側が閲覧専用・キャッシュ表示に切り替える）。
 *   それ以外（RLS 違反など。ローカルデータは復元済み）は migrationError に日本語メッセージを入れて続行する。
 *   認証トークン欠落は続く既定車両の確保でも失敗し、再ログインの案内になるので migrationError には入れない
 * - 既定車両の確保の失敗はそのまま投げ、次の呼び出しで最初からやり直す
 * - 実行した呼び出し（と、その実行に合流した同時呼び出し）の結果には、既定車両の確保で取得済みの車両一覧（vehicles）が入る。
 *   呼び出し側は直後の一覧取得に使い回して、同じ GET を重ねて発行しない。完了済みの結果を使い回す呼び出しでは古い可能性があるので
 *   vehicles を外す
 * - migrated は今回の実行で移行が Supabase へ書き込んだときだけ true（失敗・完了済みの結果の使い回しでは false）。
 *   移行の再実行（useFuelRecords からの呼び出しなど）で車両が増えたことを、呼び出し側が useVehicles へ知らせるのに使う
 *
 * 投げる例外は生のエラー。フックは runWithOutageHandling（withOutage.ts）を通して分類・日本語化する。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { hasLocalDataToMigrate, migrateLocalData, migrationErrorMessage } from "../migrateLocalData";
import { classifySupabaseFailure } from "../supabase/errors";
import { isAuthTokenError } from "../supabaseClient";
import type { Vehicle } from "../types";
import { ensureDefaultVehicle } from "./cloudStore";

export type BootstrapOptions = {
  /** 障害以外の移行失敗の 30 秒の使い回しを飛ばして再実行する */
  force?: boolean;
};

export type CloudBootstrapResult = {
  /** 移行が障害以外の理由で失敗した（ローカルデータはブラウザに残っている）。画面の error に出す日本語。成功なら null */
  migrationError: string | null;
  /**
   * 今回の呼び出しが実際に初期化を実行したときだけ入る、ensureDefaultVehicle が返した車両一覧
   * （created_at → id 順。正規化前の生の行）。完了済みの結果を使い回すときは古い可能性があるので無い
   */
  vehicles?: Vehicle[];
  /**
   * 今回の実行で移行が Supabase へ書き込んだ（車両・記録が増えた）。移行の失敗時と、完了済みの結果を使い回すときは false。
   * 実行中の呼び出しに合流した呼び出し側も同じ値を受け取る
   */
  migrated: boolean;
};

/** テスト用に差し替えられる依存 */
export type CloudBootstrapDeps = {
  migrate: (supabase: SupabaseClient, userId: string) => Promise<{ didWrite: boolean }>;
  ensureDefaultVehicle: (supabase: SupabaseClient, userId: string) => Promise<Vehicle[]>;
  hasLocalData: (userId: string) => boolean;
  now: () => number;
};

const defaultDeps: CloudBootstrapDeps = {
  migrate: migrateLocalData,
  ensureDefaultVehicle,
  hasLocalData: hasLocalDataToMigrate,
  now: () => Date.now(),
};

/** 移行が障害以外の理由で失敗した結果を使い回す時間 */
const MIGRATION_FAILURE_MEMO_MS = 30 * 1000;

type Entry = {
  promise: Promise<CloudBootstrapResult>;
  /** 完了時刻と結果（実行中は undefined） */
  settled?: { at: number; result: CloudBootstrapResult };
};

const entries = new Map<string, Entry>();

function isOutage(e: unknown): boolean {
  if (isAuthTokenError(e)) return false;
  const status = (e as { status?: unknown } | null)?.status;
  return classifySupabaseFailure(typeof status === "number" ? status : undefined, e) != null;
}

function canReuse(entry: Entry, userId: string, deps: CloudBootstrapDeps, force: boolean): boolean {
  const { settled } = entry;
  if (!settled) return true; // 実行中
  if (settled.result.migrationError) return !force && deps.now() - settled.at < MIGRATION_FAILURE_MEMO_MS;
  return !deps.hasLocalData(userId);
}

/**
 * userId のクラウドの初期化を実行する（または実行中・完了済みの結果を返す）。
 * force: true なら、障害以外の移行失敗の 30 秒の使い回しを飛ばして再実行する（利用者の明示的な再試行用。実行中の呼び出しには合流する）。
 * @throws 移行の障害、または既定車両の確保の失敗（生のエラー）
 */
export function bootstrapCloud(
  supabase: SupabaseClient,
  userId: string,
  deps: CloudBootstrapDeps = defaultDeps,
  { force = false }: BootstrapOptions = {}
): Promise<CloudBootstrapResult> {
  const existing = entries.get(userId);
  if (existing && canReuse(existing, userId, deps, force)) {
    // 実行中なら合流する（どちらの呼び出し側も新しい車両一覧を受け取る）。完了済みの結果の一覧は古い可能性があるので外す
    if (!existing.settled) return existing.promise;
    // migrated も外す（書き込みは前の呼び出しが通知済み。使い回しのたびに再読み込みさせない）
    return existing.promise.then(r => ({ migrationError: r.migrationError, migrated: false }));
  }

  const promise = (async (): Promise<CloudBootstrapResult> => {
    let migrationError: string | null = null;
    let migrated = false;
    try {
      ({ didWrite: migrated } = await deps.migrate(supabase, userId));
    } catch (e) {
      if (isOutage(e)) throw e;
      if (!isAuthTokenError(e)) migrationError = migrationErrorMessage(e);
    }
    const vehicles = await deps.ensureDefaultVehicle(supabase, userId);
    return { migrationError, vehicles, migrated };
  })();

  const entry: Entry = { promise };
  entries.set(userId, entry);
  promise.then(
    result => {
      if (entries.get(userId) === entry) entry.settled = { at: deps.now(), result };
    },
    () => {
      if (entries.get(userId) === entry) entries.delete(userId);
    }
  );
  return promise;
}
