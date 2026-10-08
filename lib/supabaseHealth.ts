/**
 * Supabase の障害検知（互換用バレル）。
 *
 * 実体は lib/supabase/ に分割している。
 * - errors.ts: 失敗の分類・ユーザー向けメッセージ（純粋関数）
 * - outage.ts: 障害状態の記録・通知・React フック
 * - retry.ts: 再試行イベントと自動再試行
 * - cache.ts: per-user キャッシュ
 * React に依存したくない側（lib/migrateLocalData.ts など）は lib/supabase/errors.ts を直接 import すること。
 */

export * from "./supabase/errors";
export * from "./supabase/outage";
export * from "./supabase/retry";
export * from "./supabase/cache";
