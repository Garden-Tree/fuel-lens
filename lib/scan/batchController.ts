import { analyzeErrorMessage, type AnalyzeSuccessResponse } from "@/lib/analyze";
import type { AnalyzeHttpResult } from "./analyzeClient";
import {
  MAX_RATE_LIMIT_RETRIES,
  createRequestPacer,
  parseRetryAfterMs,
  type RequestPacer,
} from "./batch";

/**
 * 旧レシートの一括読み取りのキュー（React に依存しない）。状態は lib/scan/useBatchScan.ts が React に渡す。
 *
 * - 写真は選んだ順に 1 枚ずつ「圧縮 → 解析」する。確認中の 1 枚（current）の次の 1 枚までを先に読み取っておく（先読みは 1 枚だけ）
 * - 解析リクエストは RequestPacer でペース配分し（直近 62 秒に 5 回まで）、429 は Retry-After だけ待って自動で再試行する。
 *   待っている間は 1 秒ごとに残り時間（waitMs）を知らせる
 * - 401 はセッション切れなので、残りを中止して終える（reason: "unauthorized"）
 * - それ以外の失敗（読み取れない・タイムアウト・通信エラー）はその写真を "failed" にして、手動入力かスキップを選べるようにする
 * - 確認中の写真の保存・スキップで次へ進む。中止（abort）は進行中のリクエストと待ちを止める
 */

export type BatchItemStatus =
  | "pending"
  | "compressing"
  | "waiting"
  | "analyzing"
  | "ready"
  | "failed"
  | "saved"
  | "skipped";

export type BatchItem = {
  /** 選択順（0 から） */
  index: number;
  status: BatchItemStatus;
  /** 圧縮済みの画像（data URL）。圧縮前・失敗時は null */
  dataUrl: string | null;
  /** 読み取り結果（status が ready のとき） */
  result: AnalyzeSuccessResponse | null;
  /** 読み取れなかった理由（status が failed のとき。日本語） */
  error: string | null;
  /** 回数制限で待っている残り時間（ミリ秒。status が waiting のとき） */
  waitMs: number;
};

export type BatchPhase = "running" | "finished" | "aborted";

export type BatchState = {
  items: readonly BatchItem[];
  /** 確認中（または読み取り待ち）の写真の位置 */
  current: number;
  phase: BatchPhase;
};

/** 終わったときの結果 */
export type BatchEnd = {
  reason: "finished" | "aborted" | "unauthorized";
  total: number;
  saved: number;
  skipped: number;
  /** 中止で読み取り・確認をしなかった枚数（確認中だった 1 枚を含む） */
  cancelled: number;
  /** unauthorized のときの案内（日本語） */
  message: string | null;
};

export type BatchDeps = {
  /** 画像を圧縮して data URL にする（lib/scan/analyzeClient.ts の compressToDataUrl） */
  compress: (file: File) => Promise<string>;
  /** POST /api/analyze（requestAnalyze）。中断時は reject してよい */
  analyze: (dataUrl: string, signal: AbortSignal) => Promise<AnalyzeHttpResult>;
  /** ログイン中か（401 の文言） */
  isSignedIn?: boolean;
  /** 現在時刻（ms）。省略時は Date.now */
  now?: () => number;
  /** 待つ。中断されたら（reject せずに）すぐ戻る。省略時は setTimeout */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  /** ペース配分（省略時は直近 62 秒に 5 回） */
  pacer?: RequestPacer;
};

export type BatchCallbacks = {
  /** 状態が変わるたびに呼ぶ（新しいオブジェクト） */
  onChange?: (state: BatchState) => void;
  /** 終わったとき（全部確認した・中止した・セッション切れ）に 1 回だけ呼ぶ。dispose では呼ばない */
  onEnd?: (end: BatchEnd) => void;
};

export type BatchController = {
  getState: () => BatchState;
  /** 読み取りを始める（1 回だけ） */
  start: () => void;
  /** 確認中の写真を保存した（ready / failed のときだけ有効）。次の写真へ進む */
  markSaved: () => void;
  /** 確認中の写真をスキップする（読み取り中なら中断する）。次の写真へ進む */
  skip: () => void;
  /** 残りを中止する（onEnd に aborted を渡す） */
  abort: () => void;
  /** 何も知らせずに止める（アンマウント時） */
  dispose: () => void;
};

/** 確認中の写真の何枚先まで読み取っておくか */
const PREFETCH_AHEAD = 1;

function defaultSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const done = () => {
      clearTimeout(id);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const id = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });
}

export function createBatchController(
  files: readonly File[],
  deps: BatchDeps,
  callbacks: BatchCallbacks = {}
): BatchController {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? defaultSleep;
  const pacer = deps.pacer ?? createRequestPacer();
  const total = files.length;

  let state: BatchState = {
    items: files.map((_, index) => ({ index, status: "pending", dataUrl: null, result: null, error: null, waitMs: 0 })),
    current: 0,
    phase: total === 0 ? "finished" : "running",
  };
  let started = false;
  let stopped = false;
  const batchAbort = new AbortController();
  const itemAborts = new Map<number, AbortController>();
  let wakers: (() => void)[] = [];

  const emit = () => callbacks.onChange?.(state);

  const updateItem = (index: number, patch: Partial<BatchItem>) => {
    if (stopped) return;
    const items = state.items.slice();
    items[index] = { ...items[index], ...patch };
    state = { ...state, items };
    emit();
  };

  const wake = () => {
    const list = wakers;
    wakers = [];
    for (const w of list) w();
  };
  const waitForAdvance = () =>
    new Promise<void>((resolve) => {
      wakers.push(resolve);
    });

  const counts = () => {
    let saved = 0;
    let skipped = 0;
    for (const item of state.items) {
      if (item.status === "saved") saved += 1;
      else if (item.status === "skipped") skipped += 1;
    }
    return { saved, skipped };
  };

  const stop = (phase: BatchPhase, end: Omit<BatchEnd, "total" | "saved" | "skipped" | "cancelled"> | null) => {
    if (stopped) return;
    const { saved, skipped } = counts();
    state = { ...state, phase };
    emit();
    stopped = true;
    batchAbort.abort();
    for (const c of itemAborts.values()) c.abort();
    itemAborts.clear();
    wake();
    if (end) {
      callbacks.onEnd?.({ ...end, total, saved, skipped, cancelled: total - saved - skipped });
    }
  };

  const advance = (outcome: "saved" | "skipped") => {
    if (stopped) return;
    const index = state.current;
    itemAborts.get(index)?.abort();
    itemAborts.delete(index);
    const items = state.items.slice();
    items[index] = { ...items[index], status: outcome, waitMs: 0 };
    state = { ...state, items, current: index + 1 };
    if (state.current >= total) {
      stop("finished", { reason: "finished", message: null });
      return;
    }
    emit();
    wake();
  };

  /** 残り時間を 1 秒ごとに知らせながら待つ */
  const countdown = async (index: number, ms: number, signal: AbortSignal) => {
    const until = now() + ms;
    for (;;) {
      if (signal.aborted) return;
      const remaining = until - now();
      if (remaining <= 0) return;
      updateItem(index, { status: "waiting", waitMs: remaining });
      await sleep(Math.min(1000, remaining), signal);
    }
  };

  const processItem = async (index: number) => {
    const controller = new AbortController();
    itemAborts.set(index, controller);
    const { signal } = controller;
    const fail = (message: string) => updateItem(index, { status: "failed", error: message, waitMs: 0 });

    try {
      updateItem(index, { status: "compressing" });
      let dataUrl: string;
      try {
        dataUrl = await deps.compress(files[index]);
      } catch (error) {
        if (signal.aborted) return;
        fail(error instanceof Error ? error.message : "画像の処理に失敗しました");
        return;
      }
      if (signal.aborted) return;
      updateItem(index, { dataUrl });

      let rateLimited = 0;
      for (;;) {
        const delay = pacer.delayMs(now());
        if (delay > 0) {
          await countdown(index, delay, signal);
          if (signal.aborted) return;
          continue; // 待ったあとにもう一度確かめる
        }
        updateItem(index, { status: "analyzing", waitMs: 0 });
        pacer.record(now());
        let res: AnalyzeHttpResult;
        try {
          res = await deps.analyze(dataUrl, signal);
        } catch (error) {
          if (signal.aborted) return;
          console.error(error);
          fail(error instanceof Error ? error.message : "解析に失敗しました。");
          return;
        }
        if (signal.aborted) return;

        if (res.status === 429) {
          rateLimited += 1;
          if (rateLimited > MAX_RATE_LIMIT_RETRIES) {
            fail(analyzeErrorMessage(429, res.body, { isSignedIn: deps.isSignedIn, retryAfter: res.retryAfter }));
            return;
          }
          // Retry-After だけ待ってから再試行する（次の写真もこの時刻までは送らない）
          pacer.blockUntil(now() + parseRetryAfterMs(res.retryAfter, now()));
          continue;
        }
        if (res.status === 401) {
          stop("aborted", {
            reason: "unauthorized",
            message: analyzeErrorMessage(401, res.body, { isSignedIn: deps.isSignedIn }),
          });
          return;
        }
        if (!res.ok || typeof res.body !== "object" || res.body === null) {
          fail(
            res.ok
              ? "解析に失敗しました。"
              : analyzeErrorMessage(res.status, res.body, { isSignedIn: deps.isSignedIn, retryAfter: res.retryAfter })
          );
          return;
        }
        updateItem(index, { status: "ready", result: res.body as AnalyzeSuccessResponse, waitMs: 0 });
        return;
      }
    } finally {
      if (itemAborts.get(index) === controller) itemAborts.delete(index);
    }
  };

  const run = async () => {
    for (let index = 0; index < total; index += 1) {
      // 確認中の写真の PREFETCH_AHEAD 枚先までしか読み取らない
      while (!stopped && index > state.current + PREFETCH_AHEAD) {
        await waitForAdvance();
      }
      if (stopped) return;
      // 読み取る前にスキップされた写真は飛ばす
      if (state.items[index].status !== "pending") continue;
      await processItem(index);
      if (stopped) return;
    }
  };

  // バッチ全体の中断を、そのとき読み取り中の写真に伝える
  batchAbort.signal.addEventListener("abort", () => {
    for (const c of itemAborts.values()) c.abort();
  });

  return {
    getState: () => state,
    start: () => {
      if (started || stopped) return;
      started = true;
      if (total === 0) return;
      emit();
      void run();
    },
    markSaved: () => {
      if (stopped) return;
      const item = state.items[state.current];
      if (!item || (item.status !== "ready" && item.status !== "failed")) return;
      advance("saved");
    },
    skip: () => advance("skipped"),
    abort: () => stop("aborted", { reason: "aborted", message: null }),
    dispose: () => stop("aborted", null),
  };
}
