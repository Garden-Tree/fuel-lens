import type { Metadata } from "next";
import Link from "next/link";
import { otherToolLinks } from "@/lib/publicNav";
import { PublicPageHeader } from "@/components/LegalPage";
import { CAR_TYPE_EFFICIENCIES, CAR_TYPE_EFFICIENCY_NOTE, formatPrice } from "@/lib/gasCostPage";
import { NATIONAL_GAS_PRICE } from "@/lib/nationalGasPrice";
import {
  ROUTES,
  ROUTE_DISTANCE_SOURCE,
  ROUTE_GAS_COST_DESCRIPTION,
  ROUTE_GAS_COST_FAQS,
  ROUTE_GAS_COST_PAGE_TITLE,
  ROUTE_GAS_COST_PATH,
  ROUTE_TOLL_NOTE,
  STANDARD_EFFICIENCY,
  buildRouteGasCostJsonLd,
  displayKm,
  routeCostTable,
  routePath,
  routePriceLabel,
  standardTotal,
  yen,
} from "@/lib/routeGasCostPage";
import RouteCta from "./_components/RouteCta";
import CostPair from "./_components/CostPair";

// ログイン不要の主要区間のガソリン代・高速代ページ（「東京 大阪 ガソリン代」「大阪から東京 車 ガソリン代」などの検索からの入口）。
// 計算機は持たず、全体が静的。区間ごとの詳細は ./[slug]/page.tsx。

const TITLE = ROUTE_GAS_COST_PAGE_TITLE;
const DESCRIPTION = ROUTE_GAS_COST_DESCRIPTION;

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: ROUTE_GAS_COST_PATH },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: ROUTE_GAS_COST_PATH,
    type: "website",
    locale: "ja_JP",
    siteName: "FuelLens",
  },
};

const LINK = "text-accent underline underline-offset-2 hover:no-underline";

export default function RouteGasCostPage() {
  const rows = routeCostTable();
  return (
    <div className="min-h-screen bg-ground font-sans text-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: buildRouteGasCostJsonLd() }} />
      <PublicPageHeader />
      <main className="mx-auto max-w-[720px] px-4 pb-16 pt-8">
        <h1 className="text-2xl font-bold">主要区間の車のガソリン代と高速代の目安</h1>
        <p className="mt-2 text-[15px] leading-7 text-sub">
          東京〜大阪や名古屋〜大阪など主要な区間を車で走ったときのガソリン代と高速代（ETC）を、片道・往復でまとめました。
          距離も料金もどちら向きで走っても同じなので、大阪→東京なら「東京〜大阪」の行を見てください。
          区間名を押すと、車種別の合計や人数で割った金額が出ます。
        </p>

        <div className="mt-8 space-y-10 text-[15px] leading-7 text-ink/90 [&_h2]:mb-3 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink">
          <section>
            <h2>ガソリン代＋高速代の合計（普通車）</h2>
            <p className="text-sm text-sub">各セルの上が片道、下が往復の金額（円）です。</p>
            <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-surface">
              <table className="w-full border-collapse text-right text-sm">
                <caption className="sr-only">
                  主要区間の普通車のガソリン代・高速代（ETC）・合計（円）。上段が片道、下段が往復。逆方向も同じ金額
                </caption>
                <thead>
                  <tr className="border-b border-line text-xs text-sub">
                    <th scope="col" className="px-2 py-2.5 text-left font-medium">区間</th>
                    <th scope="col" className="px-2 py-2.5 font-medium">高速代</th>
                    <th scope="col" className="px-2 py-2.5 font-medium">ガソリン代</th>
                    <th scope="col" className="px-2 py-2.5 font-medium">合計</th>
                  </tr>
                </thead>
                <tbody>
                  {ROUTES.map((route) => {
                    const t = standardTotal(route);
                    return (
                      <tr key={route.id} className="border-b border-line align-top last:border-b-0">
                        <th scope="row" className="px-2 py-2.5 text-left font-medium text-ink">
                          <Link href={routePath(route)} className={`inline-flex min-h-8 items-center whitespace-nowrap text-[13px] ${LINK}`}>
                            {route.name}
                          </Link>
                          <span className="block whitespace-nowrap text-xs font-normal text-sub">
                            約<span className="num">{displayKm(route.sourceKm)}</span>km
                          </span>
                        </th>
                        <td className="whitespace-nowrap px-2 py-2.5">
                          {t.toll == null ? (
                            <span className="text-xs text-sub">未確認</span>
                          ) : (
                            <CostPair oneWay={yen(t.toll)} roundTrip={yen(t.toll * 2)} />
                          )}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2.5">
                          <CostPair oneWay={yen(t.gasOneWay)} roundTrip={yen(t.gasRoundTrip)} />
                        </td>
                        <td className="whitespace-nowrap px-2 py-2.5 font-bold">
                          {t.totalOneWay == null || t.totalRoundTrip == null ? (
                            <span className="text-xs font-normal text-sub">—</span>
                          ) : (
                            <CostPair oneWay={yen(t.totalOneWay)} roundTrip={yen(t.totalRoundTrip)} />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-sub">
              ガソリン代は普通車の燃費 約<span className="num">{STANDARD_EFFICIENCY}</span>km/L・レギュラーの
              <a href={NATIONAL_GAS_PRICE.sourceUrl} target="_blank" rel="noopener noreferrer" className={LINK}>
                {routePriceLabel()}
              </a>
              で計算しています。{ROUTE_TOLL_NOTE}
            </p>
          </section>

          <section>
            <h2>車種別のガソリン代（片道・往復）</h2>
            <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
              <table className="w-full border-collapse text-right text-sm">
                <caption className="sr-only">
                  主要区間・車種別のガソリン代（円）。上段が片道、下段が往復。レギュラー {formatPrice(NATIONAL_GAS_PRICE.regular)} 円/L
                </caption>
                <thead>
                  <tr className="border-b border-line text-sub">
                    <th scope="col" className="px-1 py-2.5 text-left align-bottom font-medium">
                      区間
                    </th>
                    {CAR_TYPE_EFFICIENCIES.map(({ id, label, efficiency }) => (
                      <th key={id} scope="col" className="px-1 py-2.5 align-bottom text-xs font-medium leading-tight">
                        {label}
                        <span className="mt-0.5 block whitespace-nowrap text-[11px]">
                          約<span className="num">{efficiency}</span>km/L
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ route, costs }) => (
                    <tr key={route.id} className="border-b border-line align-top last:border-b-0">
                      <th scope="row" className="whitespace-nowrap px-1 py-2.5 text-left text-[13px] font-medium text-ink">
                        {route.name}
                      </th>
                      {costs.map(({ oneWay, roundTrip }, i) => (
                        <td key={CAR_TYPE_EFFICIENCIES[i].id} className="whitespace-nowrap px-1 py-2.5">
                          <CostPair oneWay={oneWay} roundTrip={roundTrip} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-sub">
              {CAR_TYPE_EFFICIENCY_NOTE}距離は IC 間の高速道路の距離を 5 km 単位に丸めた値で、IC までの一般道の距離は含みません。
            </p>
          </section>

          <RouteCta />

          <section>
            <h2>よくある質問</h2>
            <dl className="divide-y divide-line rounded-2xl bg-surface">
              {ROUTE_GAS_COST_FAQS.map(({ q, a }) => (
                <div key={q} className="px-4 py-4">
                  <dt className="font-bold text-ink">{q}</dt>
                  <dd className="mt-1.5 text-sm leading-6 text-sub">{a}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section>
            <h2>距離と高速代の出典</h2>
            <p className="text-sm text-sub">
              <a href={ROUTE_DISTANCE_SOURCE.url} target="_blank" rel="noopener noreferrer" className={LINK}>
                {ROUTE_DISTANCE_SOURCE.name}
              </a>
              で各区間の IC 間を検索し、高速道路だけを通る経路のうち最短の距離（{ROUTE_DISTANCE_SOURCE.retrieved}取得）と、
              同じ経路の ETC 料金（{ROUTE_DISTANCE_SOURCE.tollRetrieved}取得）を使いました。料金改定や新しい道路の開通で変わることがあります。
            </p>
            <ul className="mt-2 space-y-1 text-xs leading-relaxed text-sub">
              {ROUTES.map((route) => (
                <li key={route.id}>
                  {route.name}: {route.from}〜{route.to}（{route.via}）<span className="num">{route.sourceKm}</span> km
                </li>
              ))}
            </ul>
          </section>
        </div>

        <nav aria-label="関連ページ" className="mt-12 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-6 text-sm text-sub">
          <Link href="/" className="inline-flex min-h-10 items-center hover:text-ink">FuelLens のトップ</Link>
          {otherToolLinks(ROUTE_GAS_COST_PATH).map((l) => (
            <Link key={l.href} href={l.href} className="inline-flex min-h-10 items-center hover:text-ink">{l.label}</Link>
          ))}
          <Link href="/privacy" className="inline-flex min-h-10 items-center hover:text-ink">プライバシーポリシー</Link>
          <Link href="/terms" className="inline-flex min-h-10 items-center hover:text-ink">利用規約</Link>
        </nav>
      </main>
    </div>
  );
}
