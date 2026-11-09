/**
 * 同じキーの非同期処理を、実行中は 1 本にまとめる（タブ内）。
 * - 実行中に同じキーで呼ばれたら、新しく実行せず同じ Promise を返す
 * - 終わったら（成功・失敗とも）map から外し、次の呼び出しでやり直す。
 *   `retainOnSuccess: true` なら成功した Promise は残して使い回し、失敗したときだけ外す（冪等な「一度だけでよい」処理向け。
 *   外すのは呼び出し側が map.delete で行う）
 * - 外すのは map の値がまだその Promise のとき（途中で delete・差し替えされていたら触らない）
 * 返すのは fn() の Promise そのもの（後片付け用の派生 Promise ではない）。後片付けで未処理の reject は出さない。
 */
export function singleFlight<K, T>(
  map: Map<K, Promise<T>>,
  key: K,
  fn: () => Promise<T>,
  opts: { retainOnSuccess?: boolean } = {}
): Promise<T> {
  const existing = map.get(key);
  if (existing) return existing;

  const run = fn();
  map.set(key, run);
  const forget = () => {
    if (map.get(key) === run) map.delete(key);
  };
  if (opts.retainOnSuccess) {
    run.catch(forget);
  } else {
    // settle 直後の最初のマイクロタスクで外す
    run.finally(forget).catch(() => {});
  }
  return run;
}
