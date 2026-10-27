import type { Metadata } from "next";
import Link from "next/link";
import { Camera, ChevronRight } from "lucide-react";
import { otherToolLinks } from "@/lib/publicNav";
import { PublicPageHeader } from "@/components/LegalPage";
import { CAR_TYPE_EFFICIENCIES, CAR_TYPE_EFFICIENCY_NOTE, EXAMPLE_PRICE } from "@/lib/gasCostPage";
import {
  ROUTE_DISTANCE_SOURCE,
  ROUTE_GAS_COST_DESCRIPTION,
  ROUTE_GAS_COST_FAQS,
  ROUTE_GAS_COST_PAGE_TITLE,
  ROUTE_GAS_COST_PATH,
  buildRouteGasCostJsonLd,
  routeCostTable,
  routeGasCostLink,
  routeWarikanLink,
} from "@/lib/routeGasCostPage";
import { aiAvailabilityCopy } from "@/lib/landingPage";
import { isTrialEnabled } from "@/lib/server/analyze/trialCookie";

// ログイン不要の主要区間のガソリン代ページ（「東京 大阪 ガソリン代」などの検索からの入口）。計算機は持たず、全体が静的。

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
        <h1 className="text-2xl font-bold">主要区間のガソリン代の目安</h1>
        <p className="mt-2 text-[15px] leading-7 text-sub">
          東京〜大阪や東京〜名古屋など主要な区間を高速道路で走ったときのガソリン代を、車種ごとの燃費の目安で片道・往復にまとめました。
          高速代は含みません（高速代は NEXCO の
          <a href="https://www.driveplaza.com/" target="_blank" rel="noopener noreferrer" className={LINK}>
            ドラぷら
          </a>
          などで調べられます）。
        </p>

        <div className="mt-8 space-y-10 text-[15px] leading-7 text-ink/90 [&_h2]:mb-3 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink">
          <section>
            <h2>区間別のガソリン代（片道・往復）</h2>
            <p className="text-sm text-sub">各セルの上が片道、下が往復の金額（円）です。</p>
            <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-surface">
              <table className="w-full border-collapse text-right text-sm">
                <caption className="sr-only">
                  主要区間・車種別のガソリン代（円）。上段が片道、下段が往復。レギュラー {EXAMPLE_PRICE} 円/L の例
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
                  {rows.map(({ route, km, costs }) => (
                    <tr key={route.id} className="border-b border-line align-top last:border-b-0">
                      <th scope="row" className="px-1 py-2.5 text-left font-medium text-ink">
                        <span className="block whitespace-nowrap text-[13px]">{route.name}</span>
                        <span className="block whitespace-nowrap text-xs font-normal text-sub">
                          約<span className="num">{km}</span>km
                        </span>
                        <span className="mt-1 flex flex-wrap gap-x-2 text-xs font-normal">
                          <a href={routeGasCostLink(km)} className={`inline-flex min-h-8 items-center ${LINK}`}>
                            計算
                          </a>
                          <a href={routeWarikanLink(km)} className={`inline-flex min-h-8 items-center ${LINK}`}>
                            割り勘
                          </a>
                        </span>
                      </th>
                      {costs.map(({ oneWay, roundTrip }, i) => (
                        <td key={CAR_TYPE_EFFICIENCIES[i].id} className="whitespace-nowrap px-1 py-2.5">
                          <span className="num block text-ink">{oneWay}</span>
                          <span className="num block text-xs text-sub">{roundTrip}</span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-sub">
              {CAR_TYPE_EFFICIENCY_NOTE}単価はレギュラー <span className="num">{EXAMPLE_PRICE}</span> 円/L の例で、実際の価格は地域・時期で変わります。
              距離は IC 間の高速道路の距離を 5 km 単位に丸めた値で、IC までの一般道や都市高速の距離は含みません。
              「計算」で自分の燃費・単価のガソリン代を、「割り勘」で高速代を足した 1 人あたりを出せます。
            </p>
          </section>

          <section aria-labelledby="route-cta" className="rounded-hero border border-accent/40 bg-surface p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-accent">
                <Camera className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2 id="route-cta" className="mb-1! text-base! leading-6">
                  自分の車の実燃費で見積もるなら FuelLens
                </h2>
                <p className="text-sm leading-6 text-sub">
                  表の燃費は一般的な目安です。FuelLens はレシートとトリップメーターが写った写真を撮るだけで、AI が給油量・金額・区間距離を読み取り、
                  満タン法で実燃費を記録します。
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              <Link
                href="/app"
                data-ga-cta="cta_box"
                className="inline-flex h-11 items-center justify-center gap-1 rounded-xl bg-accent px-5 text-sm font-bold text-ground transition-colors hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                アプリを使う（無料）
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <p className="text-xs text-sub">{aiAvailabilityCopy(isTrialEnabled()).calcNote}</p>
            </div>
          </section>

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
            <h2>距離の出典</h2>
            <p className="text-sm text-sub">
              <a href={ROUTE_DISTANCE_SOURCE.url} target="_blank" rel="noopener noreferrer" className={LINK}>
                {ROUTE_DISTANCE_SOURCE.name}
              </a>
              で各区間の IC 間を検索し、高速道路だけを通る経路のうち最短の距離を使いました（{ROUTE_DISTANCE_SOURCE.retrieved}取得）。
              新しい道路の開通などで変わることがあります。
            </p>
            <ul className="mt-2 space-y-1 text-xs leading-relaxed text-sub">
              {rows.map(({ route }) => (
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
