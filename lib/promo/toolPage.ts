import type { CtaPage } from "@/lib/analytics/events";
import type { RouteKind } from "@/lib/routeGasCostPage";

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
  /** 区間ページ（/route-gas-cost/[slug]）で、この区間の種別にだけ出す（routePagePromo）。区間ページ向けの提携先だけが持つ */
  routeKinds?: readonly RouteKind[];
};

/** インズウェブ自動車保険（A8、FuelLens のサイト ID 003）。scanWait.ts の insweb-car と同じリンク */
const INSWEB_CAR_HREF = "https://px.a8.net/svt/ejp?a8mat=4BEL1G+2ZRITE+2PS+15OZHU";
const INSWEB_DISCLOSURE = "FuelLens は紹介した保険会社の見積りから報酬を受け取ることがあります。";

/**
 * 法人・個人事業主向けの 2 件（ETC協同組合・高速情報協同組合、A8 で 2026-11-08 提携）の開示文。
 * 広告主の NG 語（「申し込み」「発行」など。tests/toolPagePromo.test.ts で確認）を含めないため、ほかの提携先とは文言を変える。
 * 行楽地の区間ページの じゃらんnet も同じ文言を使う
 */
const BUSINESS_CARD_DISCLOSURE = "このリンクから FuelLens が報酬を受け取ることがあります。";

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
  {
    id: "etc-kumiai-fuel-card",
    pages: ["/expense"],
    // 法人専用ガソリンカード（ETC協同組合、A8）。広告主の NG 語: 審査なし・誰でも通る・ブラック・スタンドのブランド名・発行・申し込み。
    // 使えるスタンドのブランド名は出さない（「全国の対応スタンド」と書く）
    href: "https://px.a8.net/svt/ejp?a8mat=4BGGBM+5FA8QQ+3EV2+HV7V6",
    body: "経費の給油をカード 1 枚にまとめるなら、法人・個人事業主向けのガソリンカードも。年会費・手数料は無料で、明細がまとまるので精算が楽になります（組合加入の出資金 1 万円、脱退時返金）。",
    cta: "資料を請求する",
    disclosure: BUSINESS_CARD_DISCLOSURE,
  },
  {
    id: "kosoku-kumiai-etc-card",
    // 都市間の区間ページ（/route-gas-cost/[slug]）の高速代の下に出す。一覧（/route-gas-cost）には置かない
    pages: ["/route-gas-cost"],
    routeKinds: ["intercity"],
    // 法人 ETC カード（高速情報協同組合、A8）。広告主の NG 語: ブラック・審査なし・誰でも通る・カード会社名
    href: "https://px.a8.net/svt/ejp?a8mat=4BGGBM+5IUUDE+1WW0+5YJRM",
    body: "仕事で高速をよく使うなら、法人・個人事業主向けの ETC 専用カードも。クレジット機能なしで、新しい会社や個人事業主でも作れます（組合加入の出資金 1 万円、脱退時返金）。",
    cta: "詳しく見る",
    disclosure: BUSINESS_CARD_DISCLOSURE,
  },
  {
    id: "jalan-route-resort",
    // 行楽地への区間ページ（箱根・軽井沢など）の高速代の下に出す。調べる人は旅行者なので、法人カードではなく宿の予約サイト
    pages: ["/route-gas-cost"],
    routeKinds: ["resort"],
    // じゃらんnet 宿泊予約（株式会社リクルート、A8 プログラム s00000005230001、2026-11-12 提携）のテキスト広告（素材 ID 029）を
    // FuelLens（サイト ID 003）で作ったリンク。広告掲載 URL に https://fuel-lens.gadelog.com/route-gas-cost を提出済み。
    // 広告主の禁止事項: じゃらんnet・リクルートが運営すると誤解させる表現、実際より著しく優良・有利と誤認させる表示（景品表示法）
    href: "https://px.a8.net/svt/ejp?a8mat=4BGJFS+2MNZIA+14CS+64JTE",
    body: "泊まりがけで出かけるなら、宿もあわせて探せます。じゃらんnet は国内の宿・ホテルを予約できるサイトです。",
    cta: "じゃらんnetで宿を探す",
    disclosure: BUSINESS_CARD_DISCLOSURE,
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

/**
 * 区間ページ（/route-gas-cost/[slug]）に出す提携先。区間の種別（都市間・行楽地）が routeKinds に入っていて、リンクが入っている最初の 1 件。
 * 無ければ null（ToolPagePromoCard は何も出さない）
 */
export function routePagePromo(kind: RouteKind, promos: readonly ToolPagePromo[] = TOOL_PAGE_PROMOS): ToolPagePromo | null {
  return promos.find((p) => p.href && p.pages.includes("/route-gas-cost") && p.routeKinds?.includes(kind)) ?? null;
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
