/**
 * /api/analyze のレートリミット（ユーザー / IP ごとの 1 分間の上限と、未ログインのお試しの IP ごとの 1 日の上限）。
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

/**
 * レートリミットのキーに使うクライアントの IP。`X-Forwarded-For` の先頭（"client, proxy1, proxy2" の client）、
 * 無ければ `X-Real-IP`、どちらも無ければ "unknown"（すべてのそういうリクエストが同じバケツを共有する）。
 * IP はこのリミッタのメモリ（Map のキー）にだけ置き、ログ・Sentry には出さない。
 */
export function clientIpOf(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  const real = headers.get("x-real-ip")?.trim();
  return real || "unknown";
}

/** 本番の既定値（1 分間 5 回、キー数上限 1 万） */
export const RATE_LIMIT_WINDOW_MS = 60 * 1000;
export const MAX_REQUESTS_PER_WINDOW = 5;
export const MAX_RATE_LIMIT_KEYS = 10_000;

/**
 * 未ログインのお試し読み取りの、IP ごとの 1 日の上限（2 つ目のバケツ。createRateLimiter を 24 時間の窓で使う）。
 * 端末ごとの回数（署名付き Cookie）は Cookie を消せば数え直せるため、乱用の歯止めはこちらが受け持つ。
 * 窓は最初のリクエストから 24 時間の固定窓。1 分間の上限と同じくインスタンスごと・ベストエフォート。
 */
export const TRIAL_IP_WINDOW_MS = 24 * 60 * 60 * 1000;
export const MAX_TRIAL_REQUESTS_PER_IP_PER_DAY = 10;
