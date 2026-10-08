/**
 * /api/analyze のレートリミットと匿名お試し回数の管理。
 *
 * 注意: 状態はプロセスメモリ上の Map にあるため、サーバーレス環境（Vercel 等）では
 * インスタンスごとに別々の状態を持ち、コールドスタートで消える（ベストエフォート）。
 * 厳密な制限が必要な場合は Upstash Redis 等の外部ストアに置き換える。
 * Map と時計は注入できる（テスト用）。
 */

export type RateLimiterOptions = {
  /** 1 ウィンドウの長さ（ms） */
  windowMs: number;
  /** 1 ウィンドウあたりに許可する回数 */
  max: number;
  /** 保持するキー数の上限。超えたら全消去（メモリリーク防止） */
  maxKeys: number;
  /** 現在時刻（ms）。省略時は Date.now */
  now?: () => number;
  /** 状態を保持する Map（テストで注入できる） */
  store?: Map<string, { count: number; firstRequest: number }>;
};

export type RateLimitResult = {
  allowed: boolean;
  /** allowed=false のときの待ち時間（秒、1 以上）。allowed=true のときは 0 */
  retryAfterSec: number;
};

export type RateLimiter = {
  /**
   * レートリミットを消費する。成功・失敗にかかわらずリクエストごとに 1 回カウントする。
   * `at` を渡すとその時刻（ms）で判定する（省略時は注入された時計）。
   */
  consume(key: string, at?: number): RateLimitResult;
};

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const { windowMs, max, maxKeys } = options;
  const clock = options.now ?? Date.now;
  const windows = options.store ?? new Map<string, { count: number; firstRequest: number }>();

  function cleanup(now: number) {
    for (const [key, record] of windows.entries()) {
      if (now - record.firstRequest > windowMs) {
        windows.delete(key);
      }
    }
    if (windows.size > maxKeys) {
      windows.clear();
    }
  }

  return {
    consume(key, at) {
      const now = at ?? clock();
      cleanup(now);
      const record = windows.get(key);
      if (!record || now - record.firstRequest > windowMs) {
        windows.set(key, { count: 1, firstRequest: now });
        return { allowed: true, retryAfterSec: 0 };
      }
      record.count++;
      if (record.count > max) {
        return {
          allowed: false,
          retryAfterSec: Math.max(1, Math.ceil((record.firstRequest + windowMs - now) / 1000)),
        };
      }
      return { allowed: true, retryAfterSec: 0 };
    },
  };
}

export type AnonymousQuotaOptions = {
  /** IP ごとに許可する解析成功回数 */
  max: number;
  /** 保持するキー数の上限。超えたら全消去 */
  maxKeys: number;
  /** 状態を保持する Map（テストで注入できる） */
  store?: Map<string, number>;
};

export type AnonymousQuota = {
  /** 上限に達していれば true */
  isExceeded(ip: string): boolean;
  /** 解析成功時に 1 回加算する */
  record(ip: string): void;
  readonly max: number;
};

/** 匿名お試し回数の制限（ALLOW_ANONYMOUS_SCAN=true のときのみ使う）。IP ベース・ベストエフォート */
export function createAnonymousQuota(options: AnonymousQuotaOptions): AnonymousQuota {
  const { max, maxKeys } = options;
  const scans = options.store ?? new Map<string, number>();
  return {
    max,
    isExceeded(ip) {
      return (scans.get(ip) || 0) >= max;
    },
    record(ip) {
      if (scans.size > maxKeys) {
        scans.clear(); // メモリリーク防止のため一定サイズでリセット
      }
      scans.set(ip, (scans.get(ip) || 0) + 1);
    },
  };
}

/** 本番の既定値（1 分間 5 回、匿名お試し 3 回、キー数上限 1 万） */
export const RATE_LIMIT_WINDOW_MS = 60 * 1000;
export const MAX_REQUESTS_PER_WINDOW = 5;
export const MAX_ANONYMOUS_SCANS = 3;
export const MAX_RATE_LIMIT_KEYS = 10_000;
