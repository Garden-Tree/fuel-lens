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
 *
 * 投げる例外は生のエラー。フックは runWithOutageHandling（withOutage.ts）を通して分類・日本語化する。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { hasLocalDataToMigrate, migrateLocalData, migrationErrorMessage } from "../migrateLocalData";
import { classifySupabaseFailure } from "../supabase/errors";
import { isAuthTokenError } from "../supabaseClient";
import { ensureDefaultVehicle } from "./cloudStore";

export type BootstrapOptions = {
  /** 障害以外の移行失敗の 30 秒の使い回しを飛ばして再実行する */
  force?: boolean;
};

export type CloudBootstrapResult = {
  /** 移行が障害以外の理由で失敗した（ローカルデータはブラウザに残っている）。画面の error に出す日本語。成功なら null */
  migrationError: string | null;
};

/** テスト用に差し替えられる依存 */
export type CloudBootstrapDeps = {
  migrate: (supabase: SupabaseClient, userId: string) => Promise<unknown>;
  ensureDefaultVehicle: (supabase: SupabaseClient, userId: string) => Promise<unknown>;
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
  if (existing && canReuse(existing, userId, deps, force)) return existing.promise;

  const promise = (async (): Promise<CloudBootstrapResult> => {
    let migrationError: string | null = null;
    try {
      await deps.migrate(supabase, userId);
    } catch (e) {
      if (isOutage(e)) throw e;
      if (!isAuthTokenError(e)) migrationError = migrationErrorMessage(e);
    }
    await deps.ensureDefaultVehicle(supabase, userId);
    return { migrationError };
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
