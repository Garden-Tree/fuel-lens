import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * テスト用の偽 Supabase クライアント。
 * supabase.from(table).select().order().eq()... のチェーンを記録し、await 時に handler(query) の結果を返す thenable。
 */

export type Query = { table: string; ops: Array<{ name: string; args: unknown[] }> };
export type QueryResult = { data?: unknown; error?: unknown; status?: number };
export type Handler = (q: Query) => QueryResult | Promise<QueryResult>;

const CHAIN_METHODS = ["select", "order", "insert", "upsert", "update", "delete", "single", "eq", "or", "range"];

export function makeSupabase(handler: Handler) {
  const queries: Query[] = [];
  const from = (table: string) => {
    const q: Query = { table, ops: [] };
    queries.push(q);
    const chain: Record<string, unknown> = {};
    for (const name of CHAIN_METHODS) {
      chain[name] = (...args: unknown[]) => {
        q.ops.push({ name, args });
        return chain;
      };
    }
    chain.then = (onOk: (v: QueryResult) => unknown, onErr?: (e: unknown) => unknown) =>
      Promise.resolve()
        .then(() => handler(q))
        .then(onOk, onErr);
    return chain;
  };
  return { client: { from } as unknown as SupabaseClient, queries };
}

export function op(q: Query, name: string) {
  return q.ops.find(o => o.name === name);
}

export function ops(q: Query, name: string) {
  return q.ops.filter(o => o.name === name);
}

/** Map で動く Storage（localStorage の代わり） */
export function makeStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  const storage: Storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
  return { store, storage };
}
