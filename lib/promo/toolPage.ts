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
  /** ガソリン 1L あたりの値引き（円）。値引きの無い提携先では持たない（値引き額の文を出さない） */
  discountYenPerL?: number;
  /** 値引きの対象になる月の給油量の上限（L）。discountYenPerL とセット */
  monthlyCapL?: number;
  /** リンクの文言 */
  cta: string;
  /** 報酬を受け取ることがある旨（広告であることの明示） */
  disclosure: string;
};

/** インズウェブ自動車保険（A8、FuelLens のサイト ID 003）。scanWait.ts の insweb-car と同じリンク */
const INSWEB_CAR_HREF = "https://px.a8.net/svt/ejp?a8mat=4BEL1G+2ZRITE+2PS+15OZHU";
const INSWEB_DISCLOSURE = "FuelLens は紹介した保険会社の見積りから報酬を受け取ることがあります。";

/**
 * 同じページに複数あるときは、リンクが入っている先頭の 1 件を出す（findToolPagePromo）。
 * /gas-cost は出光でんきのリンクが入ればそちら、入るまではインズウェブ。
 */
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
  {
    id: "insweb-car-gas-cost",
    pages: ["/gas-cost"],
    // 出光でんきのリンクが入るまでの /gas-cost の PR。/annual-gas-cost とは文言だけ変える
    href: INSWEB_CAR_HREF,
    body: "ガソリン代とあわせて車の維持費を見直すなら、自動車保険も。一括見積りで複数社の保険料を比べられます（無料）。",
    cta: "無料で見積もる",
    disclosure: INSWEB_DISCLOSURE,
  },
  {
    id: "enkiro",
    pages: ["/annual-gas-cost"],
    // エンキロ（A8 プログラム s00000026472001、2026-11-05 提携）を FuelLens（サイト ID 003）で作ったリンク。
    // a8mat の前半はサイトと提携ごとに変わるので、リンクは必ず A8 の広告リンク作成で 003 を選んで作る
    href: "https://px.a8.net/svt/ejp?a8mat=4BGCF5+25ZUKI+5O9C+5YJRM",
    body: "走った距離に応じて月々の支払いが変わるマイカーリース「エンキロ」。あまり乗らない人は、車の持ち方を比べてみませんか。",
    cta: "エンキロの詳細を見る",
    disclosure: "FuelLens は紹介したサービスの申し込みから報酬を受け取ることがあります。",
  },
  {
    id: "insweb-car-annual",
    pages: ["/annual-gas-cost"],
    href: INSWEB_CAR_HREF,
    body: "車の維持費を見直すなら、自動車保険も。一括見積りで複数社の保険料を比べられます（無料）。",
    cta: "無料で見積もる",
    disclosure: INSWEB_DISCLOSURE,
  },
];

/** 月間走行距離（km）がこの値以下ならエンキロ（走行距離に応じたリース）、超えるなら自動車保険を出す */
export const ANNUAL_PROMO_ENKIRO_MAX_MONTHLY_KM = 500;

/**
 * /annual-gas-cost で出す提携先。月間走行距離が分からない（計算結果が出ていない）ときは null。
 * 500 km 以下ならエンキロ、超えるならインズウェブ。リンクが入っていなければ null
 */
export function annualGasCostPromo(monthlyKm: number | null, promos: readonly ToolPagePromo[] = TOOL_PAGE_PROMOS): ToolPagePromo | null {
  if (monthlyKm === null || !Number.isFinite(monthlyKm) || monthlyKm <= 0) return null;
  const id = monthlyKm <= ANNUAL_PROMO_ENKIRO_MAX_MONTHLY_KM ? "enkiro" : "insweb-car-annual";
  return promos.find((p) => p.id === id && p.href && p.pages.includes("/annual-gas-cost")) ?? null;
}

/** そのページに出す提携先（リンクが入っている最初の 1 件）。無ければ null */
export function findToolPagePromo(page: CtaPage, promos: readonly ToolPagePromo[] = TOOL_PAGE_PROMOS): ToolPagePromo | null {
  return promos.find((p) => p.href && p.pages.includes(page)) ?? null;
}

/**
 * 計算した給油量で値引きされる額（円、1 円未満は四捨五入）。月の上限を超える分は数えない。
 * 給油量が出ていない・0 以下・数値でない、または 1 円に満たないときは null
 */
export function fuelDiscountSavings(liters: number | null, promo: Pick<ToolPagePromo, "discountYenPerL" | "monthlyCapL">): number | null {
  if (promo.discountYenPerL === undefined || promo.monthlyCapL === undefined) return null;
  if (liters === null || !Number.isFinite(liters) || liters <= 0) return null;
  const yen = Math.round(Math.min(liters, promo.monthlyCapL) * promo.discountYenPerL);
  return yen > 0 ? yen : null;
}

/** 計算結果の数値の表示文字列（"1,234.56"）を数値にする。読めなければ null */
export function numberFromDisplay(text: string | null): number | null {
  if (text === null) return null;
  const n = Number(text.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** 計算結果の給油量の表示文字列を数値にする */
export const litersFromDisplay = numberFromDisplay;

/** 値引き額の一文。額が出せなければ null */
export function savingsText(savings: number | null): string | null {
  if (savings === null) return null;
  return `この計算の給油量なら約${savings.toLocaleString("ja-JP")}円お得です。`;
}
