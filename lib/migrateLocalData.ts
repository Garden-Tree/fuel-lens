import type { SupabaseClient } from "@supabase/supabase-js";
import type { Vehicle } from "./useVehicles";
import { isUuid } from "./recordFilters";

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

type VehicleType = "car" | "bike";
type LocalVehicle = { id: string; name: string; type: VehicleType };
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
    out.push({ id: item.id, name, type: normalizeVehicleType(item.type) });
  }
  return dedupeById(out);
}

function numberOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function stringOrNull(v: unknown): string | null {
  return typeof v === "string" ? v : null;
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
      throw new Error("他のタブでデータ移行が実行中のため、処理を開始できませんでした。しばらくしてから再読み込みしてください。");
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
 */
function withCrossTabLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks && typeof navigator.locks.request === "function") {
    // ロックはコールバックの Promise が解決するまで保持される（タブが閉じられれば自動解放）
    return new Promise<T>((resolve, reject) => {
      navigator.locks
        .request(lockName(userId), { mode: "exclusive" }, async () => {
          try {
            resolve(await fn());
          } catch (e) {
            reject(e);
          }
        })
        .catch(reject);
    });
  }
  return withLease(leaseKey(userId), fn);
}

// ------------------------------------------------------------------
// 既定車両の確保（useVehicles と移行処理で共有）
// ------------------------------------------------------------------

/** ロックを取らない内部実装。runMigration（ロック保持中）から呼ぶ。 */
async function ensureDefaultVehicleUnlocked(
  supabase: SupabaseClient,
  userId: string,
  seed?: { name: string; type: VehicleType }
): Promise<Vehicle[]> {
  const { data, error, status } = await supabase
    .from("vehicles")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw withStatus(error, status);

  const list = (data ?? []) as Vehicle[];
  if (list.length > 0) return list;

  const { data: inserted, error: insertErr, status: insertStatus } = await supabase
    .from("vehicles")
    .insert({ user_id: userId, name: seed?.name ?? DEFAULT_VEHICLE_NAME, type: seed?.type ?? "car" })
    .select()
    .single();
  if (insertErr) throw withStatus(insertErr, insertStatus);
  return [inserted as Vehicle];
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
  seed?: { name: string; type: VehicleType }
): Promise<Vehicle[]> {
  const existing = ensureInflight.get(userId);
  if (existing) return existing;

  const run = withCrossTabLock(userId, () => ensureDefaultVehicleUnlocked(supabase, userId, seed));
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
    // --- 2. 既定車両の確保 ---
    // クラウドに車両が 1 台もなければ、ローカルの default-car の名前/種別で作成する
    // （ローカルで既定車両を改名していた場合も引き継がれる）。ロック保持中なので unlocked 版を使う。
    const localDefault = localVehicles.find(v => v.id === LOCAL_DEFAULT_VEHICLE_ID);
    const cloudVehicles = await ensureDefaultVehicleUnlocked(
      supabase,
      userId,
      localDefault ? { name: localDefault.name, type: localDefault.type } : undefined
    );
    const defaultCloudId = cloudVehicles[0].id;
    const cloudIds = new Set(cloudVehicles.map(v => v.id));

    // --- 3. ローカル車両の挿入（localId → uuid 対応表を作る） ---
    const idMap: Record<string, string> = { ...readVehicleMap(userId) };
    idMap[LOCAL_DEFAULT_VEHICLE_ID] = defaultCloudId;

    let migratedVehicles = 0;
    for (const v of localVehicles) {
      if (v.id === LOCAL_DEFAULT_VEHICLE_ID) continue;
      if (isUuid(idMap[v.id]) && cloudIds.has(idMap[v.id])) continue; // 前回の試行で挿入済み

      const { data, error, status } = await supabase
        .from("vehicles")
        .insert({ user_id: userId, name: v.name, type: v.type })
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
      const createdAt = stringOrNull(r.created_at);
      return {
        user_id: userId,
        vehicle_id: vehicleId,
        date: stringOrNull(r.date) ?? new Date().toISOString().slice(0, 10),
        total_distance: numberOrNull(r.total_distance),
        fuel_amount: numberOrNull(r.fuel_amount),
        gas_station: stringOrNull(r.gas_station),
        price_per_unit: numberOrNull(r.price_per_unit),
        total_cost: numberOrNull(r.total_cost),
        fuel_efficiency: numberOrNull(r.fuel_efficiency),
        ...(createdAt && !Number.isNaN(Date.parse(createdAt)) ? { created_at: createdAt } : {}),
      };
    });

    let migratedRecords = 0;
    const CHUNK = 100;
    for (let i = 0; i < payload.length; i += CHUNK) {
      const chunk = payload.slice(i, i + CHUNK);
      const { error, status } = await supabase.from("fuel_records").insert(chunk);
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
