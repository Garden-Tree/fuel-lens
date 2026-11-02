import type { CtaPage } from "@/lib/analytics/events";

/**
 * 公開ツールページ（/gas-cost など）の計算結果の下に出す提携先の紹介（PR）の設定と、文言の組み立て（純粋関数）。
 * 解析待ちの PR（lib/promo/scanWait.ts）と同じく、href が null の間は何も出さない。
 */
export type ToolPagePromo = {
  id: string;
  /** 出すページ */
  pages: readonly CtaPage[];
  /** 提携先のリンク（A8.net。インプレッション用の画像タグは使わない）。null の間は出さない */
  href: string | null;
  /** 何をすると得になるか（給油量によらない部分） */
  body: string;
  /** ガソリン 1L あたりの値引き（円） */
  discountYenPerL: number;
  /** 値引きの対象になる月の給油量の上限（L） */
  monthlyCapL: number;
  /** リンクの文言 */
  cta: string;
  /** 報酬を受け取ることがある旨（広告であることの明示） */
  disclosure: string;
};

export const TOOL_PAGE_PROMOS: readonly ToolPagePromo[] = [
  {
    id: "idemitsu-denki",
    pages: ["/gas-cost"],
    // 出光でんき（A8）の提携が承認されたら、FuelLens（サイト ID 003）で作った広告リンクを入れる。
    // a8mat の前半はサイトとプログラムごとに変わるので、リンクは必ず A8 の広告リンク作成で掲載サイト 003 を選んで作る
    href: null,
    body: "出光でんきに切り替えると、ガソリン代が1Lあたり2円安くなります（月100Lまで・条件あり）。",
    discountYenPerL: 2,
    monthlyCapL: 100,
    cta: "出光でんきの詳細を見る",
    disclosure: "FuelLens は紹介したサービスの申し込みから報酬を受け取ることがあります。",
  },
];

/** そのページに出す提携先（リンクが入っている最初の 1 件）。無ければ null */
export function findToolPagePromo(page: CtaPage, promos: readonly ToolPagePromo[] = TOOL_PAGE_PROMOS): ToolPagePromo | null {
  return promos.find((p) => p.href && p.pages.includes(page)) ?? null;
}

/**
 * 計算した給油量で値引きされる額（円、1 円未満は四捨五入）。月の上限を超える分は数えない。
 * 給油量が出ていない・0 以下・数値でない、または 1 円に満たないときは null
 */
export function fuelDiscountSavings(liters: number | null, promo: Pick<ToolPagePromo, "discountYenPerL" | "monthlyCapL">): number | null {
  if (liters === null || !Number.isFinite(liters) || liters <= 0) return null;
  const yen = Math.round(Math.min(liters, promo.monthlyCapL) * promo.discountYenPerL);
  return yen > 0 ? yen : null;
}

/** 計算結果の給油量の表示文字列（"1,234.56"）を数値にする。読めなければ null */
export function litersFromDisplay(fuel: string | null): number | null {
  if (fuel === null) return null;
  const n = Number(fuel.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** 値引き額の一文。額が出せなければ null */
export function savingsText(savings: number | null): string | null {
  if (savings === null) return null;
  return `この計算の給油量なら約${savings.toLocaleString("ja-JP")}円お得です。`;
}
