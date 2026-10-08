/**
 * 車両ストアの list() に「取得済みの一覧を 1 回だけ返す」仕組みを足す。
 *
 * クラウドの初期化（cloudBootstrap）が既定車両の確保で車両一覧を取得済みなので、直後の list() で同じ GET を重ねて発行しない。
 * 一覧は 1 回返したら捨てる（古い一覧が残らない）。withOutageHandling / withCache より内側に被せるので、
 * 使い回した一覧も障害の扱い・キャッシュ書き込みを通る。
 */

import { normalizeVehicle } from "../fillChain";
import type { Vehicle } from "../types";
import type { VehicleStore } from "./types";

export type PrimedVehicleStore = {
  store: VehicleStore;
  /** 次の list() が返す一覧を設定する（null なら取り消す）。list() で 1 回使うと消える */
  prime: (list: Vehicle[] | null) => void;
};

export function withPrimedVehicleList(base: VehicleStore): PrimedVehicleStore {
  let primed: Vehicle[] | null = null;
  return {
    store: {
      ...base,
      async list() {
        if (primed) {
          const list = primed;
          primed = null;
          // cloudStore の list と同じく、新しい列を既定値で補完する
          return list.map(v => normalizeVehicle(v));
        }
        return base.list();
      },
    },
    prime: list => {
      primed = list;
    },
  };
}
