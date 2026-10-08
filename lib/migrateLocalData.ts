import type { SupabaseClient } from "@supabase/supabase-js";
import type { DistanceMode, FuelType, Vehicle, VehicleType } from "./types";
import { isValidCalendarDate, localDateString } from "./dates";
import { isUuid } from "./recordFilters";
import { PERMISSION_DENIED_MESSAGE, isPermissionDeniedError } from "./supabaseHealth";
import { isDistanceMode, isFuelType, sanitizeMemo, sanitizeOdometer } from "./fillChain";

/**
 * ログアウト中に localStorage へ保存した車両・給油記録を、ログイン後に
 * Supabase へ 1 回だけ移行する。
 *
 * 二重登録を防ぐための仕組み:
 *  1. タブをまたぐ排他ロック。`navigator.locks`（Web Locks API）が使える環境では
 *     `fuel_lens_migration_<userId>` を exclusive で取得する（タブが閉じれば自動解放）。
 *     使えない環境では localStorage のリース `fuel_lens_migration_lock_<userId>`
 *     （タイムスタンプ付き・実行中は定期更新・約 2 分で失効）で代替する。
 *     Clerk はログイン状態を全タブに同期するため、同一ユーザーの移行が複数タブで
 *     ほぼ同時に始まり得る。ロックを持っている間だけ `<key>_migrating_<userId>` の
 *     残骸（前回クラッシュ分）を引き継ぐ。ロックなしで引き継ぐと、別タブが実行中の
 *     データを「残骸」と誤認して全件を二重登録してしまう。
 *  2. タブ内では userId ごとの実行中 Promise をモジュールスコープで保持し、
 *     useVehicles / useFuelRecords から同時に呼ばれても 1 回しか走らない。
 *  3. 挿入前にローカルキーを `<key>_migrating_<userId>` へ「移動」する。元キーは
 *     以降の読み込みで空になるため、同じデータを二度読み込まない。
 *  4. 失敗時は移動したデータを元キーへマージして戻す（次回ログイン時に再試行）。
 *     処理中に元キーへ新しい記録が追加されていても失われない。
 *  5. 車両の挿入が終わるたびに localId→uuid の対応表を保存し、記録の挿入が
 *     途中で失敗した場合の再試行で車両を二重登録しない。記録もチャンク挿入の
 *     たびに退避データから取り除く。
 *  6. 既定車両の自動作成（ensureDefaultVehicle）も同じクロスタブロックで直列化し、
 *     新規ユーザーが複数タブを開いても「メインカー」が 1 台しか作られないようにする。
 */

export const LOCAL_RECORDS_KEY = "fuel_lens_data";
export const LOCAL_VEHICLES_KEY = "fuel_lens_vehicles";
export const LOCAL_DEFAULT_VEHICLE_ID = "default-car";
export const DEFAULT_VEHICLE_NAME = "メインカー";

/** 未ログイン時の保存（localStorage）が容量超過などで失敗したときのメッセージ */
export const LOCAL_STORAGE_FULL_MESSAGE =
  "ブラウザの保存領域がいっぱいです。不要な記録を削除するかバックアップしてください。";

/**
 * 未ログイン時のデータ（LOCAL_RECORDS_KEY / LOCAL_VEHICLES_KEY）を localStorage へ保存する。
 * 容量超過（QuotaExceededError）などで保存できなければ、生エラーを console.error に出し、
 * LOCAL_STORAGE_FULL_MESSAGE の Error を投げる（英語の DOMException を画面に出さない）。SSR 中は何もしない。
 */
export function writeLocalJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error("ローカルデータの保存失敗:", e);
    throw new Error(LOCAL_STORAGE_FULL_MESSAGE, { cause: e });
  }
}

const migratingRecordsKey = (userId: string) => `${LOCAL_RECORDS_KEY}_migrating_${userId}`;
const migratingVehiclesKey = (userId: string) => `${LOCAL_VEHICLES_KEY}_migrating_${userId}`;
const vehicleMapKey = (userId: string) => `fuel_lens_migration_vehicle_map_${userId}`;
const lockName = (userId: string) => `fuel_lens_migration_${userId}`;
const leaseKey = (userId: string) => `fuel_lens_migration_lock_${userId}`;

export type MigrationResult = {
  migratedVehicles: number;
  migratedRecords: number;
  /** 移行処理が実際に Supabase へ書き込みを行ったか */
  didWrite: boolean;
};

const NOOP_RESULT: MigrationResult = { migratedVehicles: 0, migratedRecords: 0, didWrite: false };

/** 車両の設定（0004 で追加した列）。ローカルに値があるものだけを持ち、送信する */
type VehicleSettingsColumns = { distance_mode?: DistanceMode; default_fuel_type?: FuelType };
type VehicleSeed = { name: string; type: VehicleType } & VehicleSettingsColumns;
type LocalVehicle = { id: string } & VehicleSeed;
type LocalRecordRaw = Record<string, unknown>;

// ------------------------------------------------------------------
// 小さなユーティリティ
// ------------------------------------------------------------------

function parseArray(raw: string | null): unknown[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isObjectRecord(v: unknown): v is LocalRecordRaw {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** id（文字列）で重複除去（先勝ち）。id を持たない要素はそのまま残す。 */
function dedupeById<T extends { id?: unknown }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const id = item?.id;
    if (typeof id === "string" && id) {
      if (seen.has(id)) continue;
      seen.add(id);
    }
    out.push(item);
  }
  return out;
}

function normalizeVehicleType(t: unknown): VehicleType {
  return t === "bike" ? "bike" : "car";
}

function toLocalVehicles(items: unknown[]): LocalVehicle[] {
  const out: LocalVehicle[] = [];
  for (const item of items) {
    if (!isObjectRecord(item)) continue;
    if (typeof item.id !== "string" || !item.id) continue;
    const name =
      typeof item.name === "string" && item.name.trim() ? item.name.trim().slice(0, 20) : DEFAULT_VEHICLE_NAME;
    out.push({ id: item.id, name, type: normalizeVehicleType(item.type), ...vehicleSettingsColumns(item) });
  }
  return dedupeById(out);
}

/** ローカル車両の distance_mode / default_fuel_type のうち、有効な値のものだけを返す（無ければ DB の既定値） */
function vehicleSettingsColumns(item: { distance_mode?: unknown; default_fuel_type?: unknown }): VehicleSettingsColumns {
  const out: VehicleSettingsColumns = {};
  if (isDistanceMode(item.distance_mode)) out.distance_mode = item.distance_mode;
  if (isFuelType(item.default_fuel_type)) out.default_fuel_type = item.default_fuel_type;
  return out;
}

/** 車両の insert 行（設定は値があるものだけ） */
function vehicleInsertRow(userId: string, v: VehicleSeed) {
  return { user_id: userId, name: v.name, type: v.type, ...vehicleSettingsColumns(v) };
}

/**
 * ローカル記録の 0004 の列（odometer / is_full / missed_previous / fuel_type / memo）のうち、
 * 有効な値を持つものだけを返す。無いキーは送らず、列の既定値（満タン・記録漏れなし・null）に任せる
 * （insert は defaultToNull: false）。
 */
function recordFillChainColumns(r: LocalRecordRaw): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const odometer = sanitizeOdometer(r.odometer);
  if (odometer !== null) out.odometer = odometer;
  if (typeof r.is_full === "boolean") out.is_full = r.is_full;
  if (typeof r.missed_previous === "boolean") out.missed_previous = r.missed_previous;
  if (isFuelType(r.fuel_type)) out.fuel_type = r.fuel_type;
  const memo = sanitizeMemo(r.memo);
  if (memo !== null) out.memo = memo;
  return out;
}

function numberOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function stringOrNull(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/**
 * 解析可能な日時文字列なら Date を返す。Postgres が受け付けられる範囲（4 桁の年）に限る。
 * JS の Date.parse は Postgres が拒否する書式も受け付けるため、送信時は toISOString() に正規化する。
 */
function parseTimestamp(v: unknown): Date | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const ms = Date.parse(v);
  if (Number.isNaN(ms)) return null;
  const d = new Date(ms);
  const year = d.getUTCFullYear();
  return year >= 1000 && year <= 9999 ? d : null;
}

/**
 * ローカル記録の date / created_at を Postgres が必ず受け付ける値へ正規化する。
 * - date: 有効な YYYY-MM-DD → そのまま / 無効なら created_at の（ローカル）日付 / それも無ければ今日
 * - created_at: 有効な日時 → ISO 文字列 / 無効なら date のローカル 0:00 / それも無ければ現在時刻
 *
 * created_at は常に送る。supabase-js の insert(配列) は全行のキーの和集合を列として送り、
 * キーを持たない行には null を入れるため、一部の行だけ created_at を省くと NOT NULL 違反で
 * チャンク全体が失敗する。
 */
function normalizeRecordDates(rawDate: unknown, rawCreatedAt: unknown): { date: string; created_at: string } {
  const createdAt = parseTimestamp(rawCreatedAt);
  const validDate = isValidCalendarDate(rawDate) ? rawDate : null;
  const now = new Date();

  const date = validDate ?? localDateString(createdAt ?? now);

  let created: Date;
  if (createdAt) {
    created = createdAt;
  } else if (validDate) {
    const [y, mo, d] = validDate.split("-").map(Number);
    const local = new Date(y, mo - 1, d, 0, 0, 0, 0);
    // 年 0〜99 は Date コンストラクタが 1900 年代へ解釈するので補正する
    local.setFullYear(y);
    created = parseTimestamp(local.toISOString()) ?? now;
  } else {
    created = now;
  }

  return { date, created_at: created.toISOString() };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** PostgrestError に HTTP ステータスを添えて投げ直すためのヘルパー */
export function withStatus<E extends object>(error: E, status: number | undefined): E & { status?: number } {
  const e = error as E & { status?: number };
  if (typeof e.status !== "number" && typeof status === "number") {
    try {
      e.status = status;
    } catch {
      // frozen な場合は無視
    }
  }
  return e;
}

// ------------------------------------------------------------------
// クロスタブ排他ロック
// ------------------------------------------------------------------

const LEASE_TTL_MS = 2 * 60 * 1000;
const LEASE_REFRESH_MS = 20 * 1000;
const LEASE_POLL_MS = 250;
/** Web Locks の取得待ちの上限。別タブがロックを持ったまま固まっても無限に待たない */
const LOCK_WAIT_TIMEOUT_MS = 30 * 1000;

/** クロスタブロックを取得できなかったときのエラー（メッセージは日本語でそのまま画面に出してよい） */
export class CrossTabLockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CrossTabLockError";
  }
}

type Lease = { ts: number; token: string };

function readLease(key: string): Lease | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isObjectRecord(parsed)) return null;
    const ts = parsed.ts;
    const token = parsed.token;
    if (typeof ts !== "number" || typeof token !== "string") return null;
    return { ts, token };
  } catch {
    return null;
  }
}

function leaseIsStale(lease: Lease | null): boolean {
  return !lease || Date.now() - lease.ts > LEASE_TTL_MS;
}

/**
 * Web Locks が使えない環境向けのリース方式ロック。
 * リースが無い／約 2 分より古い場合にだけ取得でき、実行中は定期的に更新する。
 */
async function withLease<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const giveUpAt = Date.now() + LEASE_TTL_MS + 10_000;

  for (;;) {
    if (leaseIsStale(readLease(key))) {
      localStorage.setItem(key, JSON.stringify({ ts: Date.now(), token } satisfies Lease));
      // 同時に書き込んだ別タブに負けていないか確認する
      await sleep(30);
      if (readLease(key)?.token === token) break;
      continue;
    }
    if (Date.now() > giveUpAt) {
      throw new CrossTabLockError("他のタブでデータ移行が実行中のため、処理を開始できませんでした。しばらくしてから再読み込みしてください。");
    }
    await sleep(LEASE_POLL_MS);
  }

  const timer = setInterval(() => {
    try {
      localStorage.setItem(key, JSON.stringify({ ts: Date.now(), token } satisfies Lease));
    } catch {
      // ベストエフォート
    }
  }, LEASE_REFRESH_MS);

  try {
    return await fn();
  } finally {
    clearInterval(timer);
    try {
      if (readLease(key)?.token === token) localStorage.removeItem(key);
    } catch {
      // ベストエフォート
    }
  }
}

/**
 * userId 単位のクロスタブ排他ロックの下で fn を実行する。
 * Web Locks API があればそれを使い（タブ終了で自動解放）、無ければリース方式にフォールバックする。
 * Web Locks の取得待ちは約 30 秒で打ち切り、CrossTabLockError を投げる（取得後の fn の実行時間は制限しない）。
 */
function withCrossTabLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks && typeof navigator.locks.request === "function") {
    // ロックはコールバックの Promise が解決するまで保持される（タブが閉じられれば自動解放）
    return new Promise<T>((resolve, reject) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), LOCK_WAIT_TIMEOUT_MS);
      navigator.locks
        .request(lockName(userId), { mode: "exclusive", signal: controller.signal }, async () => {
          clearTimeout(timer);
          try {
            resolve(await fn());
          } catch (e) {
            reject(e);
          }
        })
        .catch((e: unknown) => {
          clearTimeout(timer);
          // fn の例外はコールバック内で処理済みなので、ここに来るのはロック取得自体の失敗だけ
          reject(
            controller.signal.aborted
              ? new CrossTabLockError("他のタブの処理が完了しないため移行を中断しました。再読み込みしてください。")
              : e
          );
        });
    });
  }
  return withLease(leaseKey(userId), fn);
}

// ------------------------------------------------------------------
// 既定車両の確保（useVehicles と移行処理で共有）
// ------------------------------------------------------------------

const userRowInflight = new Map<string, Promise<void>>();

/**
 * users テーブルに userId の行があることを保証する（冪等）。
 *
 * 本番 DB では vehicles.user_id / fuel_records.user_id に users(id) への外部キー
 * （vehicles_user_id_fkey / fuel_records_user_id_fkey）があり、0001_schema_and_rls.sql も新規プロジェクトで
 * 同じ FK を作成する。そのため新規ユーザーの初回ログインで UserSync の upsert より先に車両・記録を
 * 挿入すると 23503（FK 違反）で失敗する。
 * id だけを ON CONFLICT DO NOTHING で挿入する（email などは UserSync が管理するので送らない）。
 * 成功した Promise はタブ内で userId ごとに使い回し、失敗時は破棄して次回再試行する。
 *
 * @throws Supabase エラー（status 付き）
 */
export function ensureUserRow(supabase: SupabaseClient, userId: string): Promise<void> {
  const existing = userRowInflight.get(userId);
  if (existing) return existing;

  const run = (async () => {
    const { error, status } = await supabase
      .from("users")
      .upsert({ id: userId }, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw withStatus(error, status);
  })();
  userRowInflight.set(userId, run);
  run.catch(() => {
    if (userRowInflight.get(userId) === run) userRowInflight.delete(userId);
  });
  return run;
}

/**
 * ロックを取らない内部実装。runMigration（ロック保持中）から呼ぶ。
 * `created` は既定車両をこの呼び出しで新規作成したかどうか。
 */
async function ensureDefaultVehicleUnlocked(
  supabase: SupabaseClient,
  userId: string,
  seed?: VehicleSeed
): Promise<{ vehicles: Vehicle[]; created: boolean }> {
  const { data, error, status } = await supabase
    .from("vehicles")
    .select("*")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw withStatus(error, status);

  const list = (data ?? []) as Vehicle[];
  if (list.length > 0) return { vehicles: list, created: false };

  // 車両が 1 台でもあれば users 行は FK（vehicles_user_id_fkey。本番 DB に存在し、0001 も作成する）により
  // 必ず存在する。挿入する場合だけ保証すればよい。
  await ensureUserRow(supabase, userId);

  const { data: inserted, error: insertErr, status: insertStatus } = await supabase
    .from("vehicles")
    .insert(vehicleInsertRow(userId, seed ?? { name: DEFAULT_VEHICLE_NAME, type: "car" }))
    .select()
    .single();
  if (insertErr) throw withStatus(insertErr, insertStatus);
  return { vehicles: [inserted as Vehicle], created: true };
}

const ensureInflight = new Map<string, Promise<Vehicle[]>>();

/**
 * ユーザーの車両一覧を created_at 昇順で返す。1 台もなければ既定車両を作成する。
 * 同一 userId で並行して呼ばれても作成は 1 回（タブ内の Promise 共有 + クロスタブロック）。
 *
 * @throws Supabase エラー（呼び出し側で障害分類する）。エラーには `status` を付与する。
 */
export function ensureDefaultVehicle(
  supabase: SupabaseClient,
  userId: string,
  seed?: VehicleSeed
): Promise<Vehicle[]> {
  const existing = ensureInflight.get(userId);
  if (existing) return existing;

  const run = withCrossTabLock(userId, async () => (await ensureDefaultVehicleUnlocked(supabase, userId, seed)).vehicles);
  ensureInflight.set(userId, run);
  run.finally(() => {
    if (ensureInflight.get(userId) === run) ensureInflight.delete(userId);
  }).catch(() => {});
  return run;
}

// ------------------------------------------------------------------
// 移行本体
// ------------------------------------------------------------------

const migrationInflight = new Map<string, Promise<MigrationResult>>();
/** 直近の失敗時刻（userId → epoch ms）。呼び出し側が短時間の再試行を抑止するための参考値。 */
const migrationLastFailureAt = new Map<string, number>();
const FAILURE_MEMO_MS = 30 * 1000;

/**
 * 直近 `withinMs` 以内に migrateLocalData が失敗していれば true。
 * useVehicles が失敗を握りつぶした直後に useFuelRecords が同じ移行を再実行して
 * 退避⇄復元を繰り返さないよう、2 番目以降の呼び出し側で参照する。
 * migrateLocalData 自体は常に再試行する（ここで拒否はしない）。
 */
export function migrationFailedRecently(userId: string, withinMs: number = FAILURE_MEMO_MS): boolean {
  const at = migrationLastFailureAt.get(userId);
  return at != null && Date.now() - at < withinMs;
}

/**
 * 障害以外の理由（RLS 違反・制約違反など）で移行に失敗したときに画面へ出すメッセージ。
 * ローカルデータは復元済みで、次回の読み込み時に再試行される。
 * 英語の生エラーは画面に出さず console.error にだけ出す。
 */
export function migrationErrorMessage(e: unknown): string {
  console.error("ローカルデータの移行エラー:", e);
  const prefix = "ローカルの記録をクラウドへ移行できませんでした（データはブラウザに保持されています）。";
  if (e instanceof CrossTabLockError) return `${prefix}${e.message}`;
  if (isPermissionDeniedError(e)) return `${prefix}${PERMISSION_DENIED_MESSAGE}`;
  return `${prefix}時間をおいて再試行してください。`;
}

export function migrateLocalData(supabase: SupabaseClient, userId: string): Promise<MigrationResult> {
  if (typeof window === "undefined" || !userId) return Promise.resolve(NOOP_RESULT);

  const existing = migrationInflight.get(userId);
  if (existing) return existing;

  const run = withCrossTabLock(userId, () => runMigration(supabase, userId));
  migrationInflight.set(userId, run);
  // in-flight の解除は run に直接ぶら下げる（settle 直後の最初のマイクロタスクで解除される）
  run.finally(() => {
    if (migrationInflight.get(userId) === run) migrationInflight.delete(userId);
  }).catch(() => {});
  run.then(
    () => {
      migrationLastFailureAt.delete(userId);
    },
    () => {
      migrationLastFailureAt.set(userId, Date.now());
    }
  );
  return run;
}

/** 退避キーの内容を元キーへマージして戻す（失敗時の復元）。 */
function mergeBack(originalKey: string, pendingKey: string) {
  const pendingRaw = localStorage.getItem(pendingKey);
  if (!pendingRaw) return;
  const pending = parseArray(pendingRaw);
  if (pending.length === 0) {
    // 解析不能な残骸は捨てる
    localStorage.removeItem(pendingKey);
    return;
  }
  // 処理中に別タブ（ログアウト状態）が元キーへ書き込んでいても失わないよう、両方を結合して id で重複除去する。
  // 元キー側（最新の状態）を先頭にして順序を保つ（車両は先頭が既定車両）。
  const current = parseArray(localStorage.getItem(originalKey));
  const merged = dedupeById([...current, ...pending].filter(isObjectRecord));
  try {
    localStorage.setItem(originalKey, JSON.stringify(merged));
  } catch (e) {
    // 書き戻せなかった場合は退避キーを残し、次回に再試行できるようにする
    console.error("ローカルデータの復元に失敗しました:", e);
    return;
  }
  localStorage.removeItem(pendingKey);
}

async function runMigration(supabase: SupabaseClient, userId: string): Promise<MigrationResult> {
  const recKey = migratingRecordsKey(userId);
  const vehKey = migratingVehiclesKey(userId);

  // --- 1. ローカルキーを「移行中」キーへ移動 ---
  // ここはクロスタブロックの中なので、移行中キーに残っているデータは前回クラッシュ分と断定でき、取り込んでよい。
  const pendingRecordsRaw = localStorage.getItem(recKey);
  const pendingVehiclesRaw = localStorage.getItem(vehKey);
  const freshRecordsRaw = localStorage.getItem(LOCAL_RECORDS_KEY);
  const freshVehiclesRaw = localStorage.getItem(LOCAL_VEHICLES_KEY);

  if (!pendingRecordsRaw && !pendingVehiclesRaw && !freshRecordsRaw && !freshVehiclesRaw) {
    return NOOP_RESULT;
  }

  // 記録: pending + fresh を 1 本の配列にまとめ、オブジェクト以外を除外し、id で重複除去する。
  // 以降の payload 作成・チャンク進捗の記録はすべてこの配列を基準にする。
  const localRecords: LocalRecordRaw[] = dedupeById(
    [...parseArray(pendingRecordsRaw), ...parseArray(freshRecordsRaw)].filter(isObjectRecord)
  );
  const localVehicles = toLocalVehicles([...parseArray(pendingVehiclesRaw), ...parseArray(freshVehiclesRaw)]);

  // 原子的に移動: 先に移行中キーへ書き、その後に元キーを削除する
  try {
    if (localRecords.length > 0) localStorage.setItem(recKey, JSON.stringify(localRecords));
    else localStorage.removeItem(recKey);
    if (localVehicles.length > 0) localStorage.setItem(vehKey, JSON.stringify(localVehicles));
    else localStorage.removeItem(vehKey);
  } catch (e) {
    // 書き込めない場合は移行を諦める（元データはそのまま残る）
    console.error("ローカルデータの退避に失敗しました:", e);
    return NOOP_RESULT;
  }
  localStorage.removeItem(LOCAL_RECORDS_KEY);
  localStorage.removeItem(LOCAL_VEHICLES_KEY);

  const restore = () => {
    try {
      mergeBack(LOCAL_RECORDS_KEY, recKey);
      mergeBack(LOCAL_VEHICLES_KEY, vehKey);
    } catch (e) {
      console.error("ローカルデータの復元に失敗しました:", e);
    }
  };

  if (localRecords.length === 0 && localVehicles.length === 0) {
    // 解析できるデータがない（破損 JSON 等）。ローカルキーの掃除だけ行う。
    localStorage.removeItem(recKey);
    localStorage.removeItem(vehKey);
    localStorage.removeItem(vehicleMapKey(userId));
    return NOOP_RESULT;
  }

  try {
    // --- 2a. users 行の確保（車両・記録の FK 先。UserSync の upsert より先に走っても失敗しないように） ---
    await ensureUserRow(supabase, userId);

    // --- 2b. 既定車両の確保 ---
    // クラウドに車両が 1 台もなければ、ローカルの default-car の名前/種別で作成する
    // （ローカルで既定車両を改名していた場合も引き継がれる）。ロック保持中なので unlocked 版を使う。
    // ローカルで default-car を削除していた（車両が 2 台以上なら可能）場合は、ローカルの先頭車両を
    // 既定車両の種にする。そうしないと幻の「メインカー」が作られ、それがクラウドの先頭（未分類記録の
    // 置き場）になってしまう。種にした車両は下のループで二重に挿入しないよう対応表へ登録する。
    const localDefault = localVehicles.find(v => v.id === LOCAL_DEFAULT_VEHICLE_ID);
    const seedVehicle = localDefault ?? localVehicles[0];
    const { vehicles: cloudVehicles, created: createdDefault } = await ensureDefaultVehicleUnlocked(
      supabase,
      userId,
      seedVehicle
        ? { name: seedVehicle.name, type: seedVehicle.type, ...vehicleSettingsColumns(seedVehicle) }
        : undefined
    );
    const defaultCloudId = cloudVehicles[0].id;
    const cloudIds = new Set(cloudVehicles.map(v => v.id));

    // --- 3. ローカル車両の挿入（localId → uuid 対応表を作る） ---
    const idMap: Record<string, string> = { ...readVehicleMap(userId) };
    idMap[LOCAL_DEFAULT_VEHICLE_ID] = defaultCloudId;

    let migratedVehicles = 0;
    if (createdDefault && !localDefault && seedVehicle) {
      idMap[seedVehicle.id] = defaultCloudId;
      migratedVehicles += 1;
      writeVehicleMap(userId, idMap); // 途中失敗時の再試行で同じ車両を二重登録しない
    }

    for (const v of localVehicles) {
      if (v.id === LOCAL_DEFAULT_VEHICLE_ID) continue;
      if (isUuid(idMap[v.id]) && cloudIds.has(idMap[v.id])) continue; // 前回の試行で挿入済み

      const { data, error, status } = await supabase
        .from("vehicles")
        .insert(vehicleInsertRow(userId, v))
        .select()
        .single();
      if (error) throw withStatus(error, status);

      const inserted = data as Vehicle;
      idMap[v.id] = inserted.id;
      cloudIds.add(inserted.id);
      migratedVehicles += 1;
      writeVehicleMap(userId, idMap); // 1 台ごとに保存し、途中失敗時の再試行で二重登録しない
    }

    // --- 4. 給油記録の挿入（vehicle_id を対応表で変換） ---
    const payload = localRecords.map(r => {
      const rawVid = typeof r.vehicle_id === "string" ? r.vehicle_id : null;
      let vehicleId: string;
      if (rawVid && isUuid(rawVid) && cloudIds.has(rawVid)) {
        vehicleId = rawVid;
      } else if (rawVid && isUuid(idMap[rawVid])) {
        vehicleId = idMap[rawVid];
      } else {
        vehicleId = defaultCloudId; // default-car / 不明な id / 未設定 → 既定車両
      }
      // date / created_at は必ず有効な値で送る（無効な値が 1 行でもあるとチャンク全体が拒否され、
      // 退避⇄復元を毎回繰り返してしまう）
      const { date, created_at } = normalizeRecordDates(r.date, r.created_at);
      return {
        user_id: userId,
        vehicle_id: vehicleId,
        date,
        total_distance: numberOrNull(r.total_distance),
        fuel_amount: numberOrNull(r.fuel_amount),
        gas_station: stringOrNull(r.gas_station),
        price_per_unit: numberOrNull(r.price_per_unit),
        total_cost: numberOrNull(r.total_cost),
        fuel_efficiency: numberOrNull(r.fuel_efficiency),
        created_at,
        ...recordFillChainColumns(r),
      };
    });

    let migratedRecords = 0;
    const CHUNK = 100;
    for (let i = 0; i < payload.length; i += CHUNK) {
      const chunk = payload.slice(i, i + CHUNK);
      // defaultToNull: false — 万一キーが欠けた行があっても null ではなく列の DEFAULT を使わせる
      const { error, status } = await supabase.from("fuel_records").insert(chunk, { defaultToNull: false });
      if (error) throw withStatus(error, status);
      migratedRecords += chunk.length;
      // 挿入済みチャンクを退避データから取り除き、途中失敗時の再試行で二重登録しない
      // （payload と localRecords は同じ配列から 1:1 で作られているので添字が一致する）
      const remaining = localRecords.slice(i + CHUNK);
      if (remaining.length > 0) localStorage.setItem(recKey, JSON.stringify(remaining));
      else localStorage.removeItem(recKey);
    }

    // --- 5. 成功: ローカルの退避データと対応表を削除 ---
    localStorage.removeItem(recKey);
    localStorage.removeItem(vehKey);
    localStorage.removeItem(vehicleMapKey(userId));

    return { migratedVehicles, migratedRecords, didWrite: migratedVehicles > 0 || migratedRecords > 0 };
  } catch (e) {
    console.error("ローカルデータのクラウド移行に失敗しました:", e);
    restore();
    throw e;
  }
}

function readVehicleMap(userId: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(vehicleMapKey(userId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!isObjectRecord(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function writeVehicleMap(userId: string, map: Record<string, string>) {
  try {
    localStorage.setItem(vehicleMapKey(userId), JSON.stringify(map));
  } catch {
    // ベストエフォート
  }
}
