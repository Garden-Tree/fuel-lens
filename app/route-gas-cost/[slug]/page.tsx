import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { otherToolLinks } from "@/lib/publicNav";
import { PublicPageHeader } from "@/components/LegalPage";
import { ANNUAL_GAS_COST_PATH } from "@/lib/annualGasCostPage";
import { CAR_TYPE_EFFICIENCY_NOTE } from "@/lib/gasCostPage";
import { NATIONAL_GAS_PRICE } from "@/lib/nationalGasPrice";
import {
  ROUTES,
  ROUTE_DISTANCE_SOURCE,
  ROUTE_GAS_COST_PATH,
  ROUTE_TOLL_NOTE,
  displayKm,
  reverseRouteName,
  routeGasCostLink,
  routePath,
  routePriceLabel,
  standardTotal,
  yen,
} from "@/lib/routeGasCostPage";
import {
  SPLIT_ROUNDING_NOTE,
  buildRouteDetailJsonLd,
  findRoute,
  neighborRoutes,
  routeCarRows,
  routePageDescription,
  routePageTitle,
  routeSplits,
  routeStaticParams,
  routeWarikanLink,
} from "@/lib/routeDetailPage";
import RouteCta from "../_components/RouteCta";
import CostPair from "../_components/CostPair";
import ToolPagePromoCard from "@/components/ToolPagePromoCard";
import { findToolPagePromo } from "@/lib/promo/toolPage";

// 区間ごとのガソリン代・高速代のページ（「大阪から東京 車 ガソリン代」などの検索からの入口）。ROUTES から静的に生成する。

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return routeStaticParams();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const route = findRoute((await params).slug);
  if (!route) return {};
  const title = routePageTitle(route);
  const description = routePageDescription(route);
  const path = routePath(route);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, type: "website", locale: "ja_JP", siteName: "FuelLens" },
  };
}

// 高速代の下に 1 回だけ出す提携先（法人 ETC カード）
const PROMO = findToolPagePromo(ROUTE_GAS_COST_PATH);

const LINK = "text-accent underline underline-offset-2 hover:no-underline";

export default async function RouteDetailPage({ params }: Props) {
  const route = findRoute((await params).slug);
  if (!route) notFound();
  const km = displayKm(route.sourceKm);
  const total = standardTotal(route);
  const carRows = routeCarRows(route);
  const splits = routeSplits(route);
  const neighbors = neighborRoutes(route);

  return (
    <div className="min-h-screen bg-ground font-sans text-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: buildRouteDetailJsonLd(route) }} />
      <PublicPageHeader />
      <main className="mx-auto max-w-[720px] px-4 pb-16 pt-8">
        <p className="text-xs text-sub">
          <Link href={ROUTE_GAS_COST_PATH} className={LINK}>
            主要区間のガソリン代と高速代
          </Link>
          {" › "}
          {route.name}
        </p>
        <h1 className="mt-2 text-2xl font-bold">
          {route.name}の車のガソリン代と高速代
          <span className="mt-1 block text-base font-medium text-sub">（{reverseRouteName(route)}も同じ金額）</span>
        </h1>
        <p className="mt-3 text-[15px] leading-7 text-sub">
          {route.from}〜{route.to}（{route.via}、約<span className="num">{km}</span>km）を普通車で走ると、
          {total.totalOneWay != null && total.totalRoundTrip != null ? (
            <>
              ガソリン代と高速代の合計は片道 <strong className="num text-ink">{yen(total.totalOneWay)}</strong> 円、往復{" "}
              <strong className="num text-ink">{yen(total.totalRoundTrip)}</strong> 円が目安です。
            </>
          ) : (
            <>
              ガソリン代は片道 <strong className="num text-ink">{yen(total.gasOneWay)}</strong> 円、往復{" "}
              <strong className="num text-ink">{yen(total.gasRoundTrip)}</strong> 円が目安です（高速代は確認できていないため含みません）。
            </>
          )}
        </p>

        <div className="mt-8 space-y-10 text-[15px] leading-7 text-ink/90 [&_h2]:mb-3 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink">
          <section>
            <h2>距離と高速代（片道）</h2>
            <dl className="divide-y divide-line rounded-2xl bg-surface text-sm">
              <div className="flex justify-between gap-4 px-4 py-3">
                <dt className="text-sub">距離</dt>
                <dd>
                  約<span className="num">{km}</span>km（ルート検索の値 <span className="num">{route.sourceKm}</span>km）
                </dd>
              </div>
              <div className="flex justify-between gap-4 px-4 py-3">
                <dt className="text-sub">高速代（ETC）</dt>
                <dd className="text-right">
                  {route.toll ? (
                    <>
                      普通車 <span className="num">{yen(route.toll.standard)}</span> 円
                      <span className="block text-xs text-sub">
                        軽自動車等 <span className="num">{yen(route.toll.kei)}</span> 円
                      </span>
                    </>
                  ) : (
                    "未確認"
                  )}
                </dd>
              </div>
            </dl>
            <ToolPagePromoCard promo={PROMO} page={ROUTE_GAS_COST_PATH} liters={null} />
          </section>

          <section>
            <h2>車種別のガソリン代と合計</h2>
            <p className="text-sm text-sub">各セルの上が片道、下が往復の金額（円）です。軽自動車は軽自動車等、ほかは普通車の高速代で合計しています。</p>
            <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-surface">
              <table className="w-full border-collapse text-right text-sm">
                <caption className="sr-only">{route.name}の車種別のガソリン代と、高速代を足した合計（円）。上段が片道、下段が往復</caption>
                <thead>
                  <tr className="border-b border-line text-xs text-sub">
                    <th scope="col" className="px-2 py-2.5 text-left font-medium">車種</th>
                    <th scope="col" className="px-2 py-2.5 font-medium">ガソリン代</th>
                    <th scope="col" className="px-2 py-2.5 font-medium">高速代込み</th>
                  </tr>
                </thead>
                <tbody>
                  {carRows.map(({ id, label, efficiency, total: t }) => (
                    <tr key={id} className="border-b border-line align-top last:border-b-0">
                      <th scope="row" className="px-2 py-2.5 text-left font-medium text-ink">
                        <span className="block text-[13px]">{label}</span>
                        <span className="block text-xs font-normal text-sub">
                          約<span className="num">{efficiency}</span>km/L
                        </span>
                      </th>
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
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2>何人で割ると1人いくら？</h2>
            <p className="text-sm text-sub">
              普通車で往復したときの{total.totalRoundTrip != null ? "合計" : "ガソリン代"}を割った金額です（{SPLIT_ROUNDING_NOTE}）。
            </p>
            <ul className="mt-3 grid grid-cols-3 gap-2 text-center">
              {splits.map(({ people, perPerson }) => (
                <li key={people} className="rounded-xl bg-surface px-2 py-3">
                  <span className="block text-xs text-sub">{people}人</span>
                  <span className="num text-lg font-bold text-ink">{yen(perPerson)}</span>
                  <span className="text-xs text-sub"> 円</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm">
              <a href={routeWarikanLink(route)} className={LINK}>
                割り勘の計算機で人数や運転手の分を変える
              </a>
            </p>
          </section>

          <section>
            <h2>計算の前提</h2>
            <ul className="list-disc space-y-1 pl-5 text-sm text-sub">
              <li>
                ガソリン代はレギュラーの
                <a href={NATIONAL_GAS_PRICE.sourceUrl} target="_blank" rel="noopener noreferrer" className={LINK}>
                  {routePriceLabel()}
                </a>
                で計算。{CAR_TYPE_EFFICIENCY_NOTE}
              </li>
              <li>
                {ROUTE_TOLL_NOTE}料金は
                <a href={ROUTE_DISTANCE_SOURCE.url} target="_blank" rel="noopener noreferrer" className={LINK}>
                  {ROUTE_DISTANCE_SOURCE.name}
                </a>
                で{route.retrieved ?? ROUTE_DISTANCE_SOURCE.tollRetrieved}に確認しました。
              </li>
              <li>距離は IC 間の高速道路の距離を 5 km 単位に丸めた値で、IC までの一般道は含みません。</li>
            </ul>
            <p className="mt-3 text-sm">
              <a href={routeGasCostLink(km)} className={LINK}>
                自分の車の燃費と単価で計算する
              </a>
            </p>
            <p className="mt-1 text-sm text-sub">
              通勤など毎月の運転なら
              <Link href={ANNUAL_GAS_COST_PATH} className={LINK}>
                ガソリン代が月いくら・年いくらか
              </Link>
              も計算できます。
            </p>
          </section>

          <RouteCta />

          <section>
            <h2>ほかの区間</h2>
            <ul className="space-y-1 text-sm">
              {neighbors.map((r) => {
                const t = standardTotal(r);
                return (
                  <li key={r.id}>
                    <Link href={routePath(r)} className={`inline-flex min-h-8 items-center ${LINK}`}>
                      {r.name}
                    </Link>
                    <span className="text-sub">
                      {" "}
                      普通車・片道 <span className="num">{yen(t.totalOneWay ?? t.gasOneWay)}</span> 円
                      {t.totalOneWay == null ? "（ガソリン代のみ）" : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-sm">
              <Link href={ROUTE_GAS_COST_PATH} className={`inline-flex min-h-8 items-center ${LINK}`}>
                主要{ROUTES.length}区間の一覧を見る
              </Link>
            </p>
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
