/**
 * アカウント削除のうち、クラウド（Supabase）のデータの削除。ログイン中だけ使う（未ログインにはアカウントが無い）。
 *
 * サーバーに service_role キーを置かないため、ブラウザから利用者自身の Clerk JWT（RLS）で削除する。
 * ポリシーは supabase/migrations/0001_schema_and_rls.sql の fuel_records_delete_own / vehicles_delete_own /
 * users_delete_own（いずれも (select auth.jwt()->>'sub') と行の user_id / id の一致）。
 *
 * users 行の削除は外部キー（vehicles_user_id_fkey / fuel_records_user_id_fkey の ON DELETE CASCADE）で車両・記録も消すが、
 * 本番 DB の既存の外部キーは 0001 より前に作られており削除時の動作を保証できないため、記録 → 車両 → users 行の順に明示的に削除する
 * （外部キーが NO ACTION でも失敗しない。CASCADE なら記録・車両の削除は 0 件になるだけ）。
 * 最後に記録・車両・users 行が 1 件も残っていないことを確かめる。何度呼んでも同じ結果になる（冪等。再試行できる）。
 *
 * ここは「生の層」: Supabase の失敗は status を付けてそのまま投げる。障害の分類・閲覧専用の拒否・日本語への変換は
 * 呼び出し側（useDataStores の deleteAccountData）が runWithOutageHandling で行う。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { withStatus } from "./cloudStore";
import { DataError } from "./types";

/** DataError.code: 削除の後にデータが残っていた */
export const DELETE_INCOMPLETE_CODE = "DELETE_INCOMPLETE";

export const DELETE_INCOMPLETE_MESSAGE =
  "データを削除しきれませんでした。時間をおいて、もう一度お試しください。";

/**
 * userId の記録・車両・users 行を削除し、どれも残っていないことを確認する。
 * @throws Supabase エラー（status 付き）、または残っていたときの DataError（DELETE_INCOMPLETE_CODE）
 */
export async function deleteOwnData(supabase: SupabaseClient, userId: string): Promise<void> {
  if (!userId) throw new DataError("ログイン情報を確認できませんでした。再読み込みしてください。");

  for (const table of ["fuel_records", "vehicles"] as const) {
    const { error, status } = await supabase.from(table).delete().eq("user_id", userId);
    if (error) throw withStatus(error, status);
  }
  const { error: userError, status: userStatus } = await supabase.from("users").delete().eq("id", userId);
  if (userError) throw withStatus(userError, userStatus);

  // 残っていないことを確認する（1 行だけ読む。users 行は id で調べる）
  for (const [table, column] of [
    ["fuel_records", "user_id"],
    ["vehicles", "user_id"],
    ["users", "id"],
  ] as const) {
    const { data, error, status } = await supabase.from(table).select("id").eq(column, userId).range(0, 0);
    if (error) throw withStatus(error, status);
    if (Array.isArray(data) && data.length > 0) {
      console.error(`アカウント削除の後に ${table} の行が残っています`);
      throw new DataError(DELETE_INCOMPLETE_MESSAGE, { code: DELETE_INCOMPLETE_CODE });
    }
  }
}
