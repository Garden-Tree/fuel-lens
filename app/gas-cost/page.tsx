import type { Metadata } from "next";
import Link from "next/link";
import { otherToolLinks } from "@/lib/publicNav";
import { Camera, ChevronRight } from "lucide-react";
import { PublicPageHeader } from "@/components/LegalPage";
import {
  CAR_TYPE_EFFICIENCY_NOTE,
  COMMUTE_EXAMPLE,
  EXAMPLE_PRICE,
  FORMULA_EXAMPLE,
  GAS_COST_CALCULATOR_ID,
  GAS_COST_DESCRIPTION,
  GAS_COST_FAQS,
  GAS_COST_PAGE_TITLE,
  GAS_COST_PATH,
  buildGasCostJsonLd,
  commuteExample,
  formatPrice,
  formulaExample,
  quickAnswerText,
} from "@/lib/gasCostPage";
import GasCostCalculator from "./_components/GasCostCalculator";
import DistanceCostTable from "./_components/DistanceCostTable";
import { aiAvailabilityCopy } from "@/lib/landingPage";
import { isTrialEnabled } from "@/lib/server/analyze/trialCookie";
import AppQrHandoff from "@/components/AppQrHandoff";
import { routePath, snippetRoutes } from "@/lib/routeGasCostPage";

// ログイン不要のガソリン代計算ページ（検索からの入口）。計算機だけクライアント部品で、説明と FAQ は静的に描画する。

const TITLE = GAS_COST_PAGE_TITLE;
const DESCRIPTION = GAS_COST_DESCRIPTION;

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: GAS_COST_PATH },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: GAS_COST_PATH,
    type: "website",
    locale: "ja_JP",
    siteName: "FuelLens",
  },
};

export default function GasCostPage() {
  const commute = commuteExample();
  const formula = formulaExample();
  const price = formatPrice(EXAMPLE_PRICE);
  return (
    <div className="min-h-screen bg-ground font-sans text-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: buildGasCostJsonLd() }} />
      <PublicPageHeader />
      <main className="mx-auto max-w-[720px] px-4 pb-16 pt-8">
        <h1 className="text-2xl font-bold">ガソリン代計算ツール</h1>
        <p className="mt-3 rounded-2xl border border-accent/40 bg-surface px-4 py-3 text-[15px] font-bold leading-7 text-ink">
          {quickAnswerText()}
        </p>
        <p className="mt-3 text-[15px] leading-7 text-sub">
          走行距離・燃費・単価から、ガソリン量とガソリン代を計算します。往復・割り勘にも対応し、登録は不要です。
        </p>

        <div id={GAS_COST_CALCULATOR_ID} className="mt-6 scroll-mt-4">
          <GasCostCalculator />
        </div>

        <div className="mt-12 space-y-10 text-[15px] leading-7 text-ink/90 [&_h2]:mb-3 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink [&_li]:mt-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p+p]:mt-2 [&_p+ul]:mt-2 [&_strong]:text-ink [&_ul]:list-disc [&_ul]:pl-5">
          <section>
            <h2>距離別のガソリン代の目安</h2>
            <p>
              距離をタップすると、その距離を入れて上のツールが開きます。
            </p>
            <DistanceCostTable />
            <p className="mt-2 text-xs text-sub">
              {CAR_TYPE_EFFICIENCY_NOTE}単価は上の計算機に出している全国平均で、実際の価格は地域・時期で変わります（1 円未満は四捨五入）。
            </p>
          </section>

          <section>
            <h2>計算式</h2>
            <div className="rounded-2xl border border-line bg-surface px-4 py-4 text-center">
              <p className="text-base font-bold text-ink">必要なガソリン量（L）= 走行距離（km）÷ 燃費（km/L）</p>
              <p className="mt-1 text-base font-bold text-ink">ガソリン代（円）= ガソリン量（L）× ガソリン単価（円/L）</p>
              <p className="mt-2 text-sm text-sub">
                例: <span className="num">{FORMULA_EXAMPLE.distanceKm}</span> km ÷ <span className="num">{FORMULA_EXAMPLE.efficiency}</span> km/L ={" "}
                <span className="num">{formula.fuel}</span> L、<span className="num">{formula.fuel}</span> L × <span className="num">{price}</span> 円/L ={" "}
                <span className="num text-money">{formula.cost}</span> 円
              </p>
            </div>
            <p className="mt-3">
              1km あたりは単価 ÷ 燃費で、上の例なら約 <span className="num">{formula.costPerKm}</span> 円/km です。交通費精算の目安にもなります。
            </p>
          </section>

          <section>
            <h2>距離からガソリン代を出す手順</h2>
            <ol>
              <li>
                地図アプリで目的地までの走行距離（km）を調べます（
                {snippetRoutes().map((r, i) => (
                  <span key={r.id}>
                    {i > 0 && "・"}
                    <Link href={routePath(r)} className="text-accent underline underline-offset-2 hover:no-underline">
                      {r.name}
                    </Link>
                  </span>
                ))}
                などの主要区間は、高速代も足した
                <Link href="/route-gas-cost" className="text-accent underline underline-offset-2 hover:no-underline">
                  区間別のガソリン代と高速代
                </Link>
                に）。
              </li>
              <li>
                自分の車の燃費（km/L）を確かめます。実燃費は
                <Link href="/calc" className="text-accent underline underline-offset-2 hover:no-underline">
                  満タン法 燃費計算ツール
                </Link>
                で測れます。
              </li>
              <li>給油するスタンドの単価（円/L）を確認します。わからなければ全国平均のボタンで入れられます。</li>
            </ol>
          </section>

          <section>
            <h2>往復・割り勘・通勤の使い方</h2>
            <ul>
              <li>
                <strong>往復。</strong>片道の距離を入れて「往復」を選ぶと、2 倍にして計算します。
              </li>
              <li>
                <strong>割り勘。</strong>高速代も含めた 1 人あたりや、運転手は払わない割り方は{" "}
                <Link href="/warikan" className="text-accent underline underline-offset-2 hover:no-underline">
                  ガソリン代の割り勘計算
                </Link>
                で出せます。
              </li>
              <li>
                <strong>通勤の月額。</strong>片道の距離 × 2 × 出勤日数で月の走行距離を出して計算します。たとえば片道{" "}
                <span className="num">{COMMUTE_EXAMPLE.oneWayKm}</span> km、燃費 <span className="num">{COMMUTE_EXAMPLE.efficiency}</span> km/L、
                単価 <span className="num">{price}</span> 円/L（全国平均）なら、1 日 <span className="num">{commute.perDay}</span> 円、
                月 <span className="num">{COMMUTE_EXAMPLE.days}</span> 日出勤で <span className="num">{commute.perMonth}</span> 円です。
              </li>
            </ul>
            <p className="mt-3 text-sm text-sub">
              月額・年額を出すなら{" "}
              <Link href="/annual-gas-cost" className="text-accent underline underline-offset-2 hover:no-underline">
                ガソリン代が月いくら・年いくらかの計算ツール
              </Link>
              へ。L/100km や mpg の燃費しか分からないときは{" "}
              <Link href="/fuel-convert" className="text-accent underline underline-offset-2 hover:no-underline">
                燃費の単位換算ツール
              </Link>
              で km/L にそろえてください。
            </p>
          </section>

          <section aria-labelledby="gas-cost-cta" className="rounded-hero border border-accent/40 bg-surface p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-accent">
                <Camera className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2 id="gas-cost-cta" className="mb-1! text-base! leading-6">
                  実燃費を記録しておくなら FuelLens
                </h2>
                <p className="text-sm leading-6 text-sub">
                  実燃費を記録しておけば、ガソリン代の見積もりも正確になります。FuelLens はレシートとトリップメーターが写った写真を撮るだけで、
                  AI が給油量・金額・区間距離を読み取り、満タン法で燃費を記録します。燃費と給油代の推移もグラフで見られます。
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
            <AppQrHandoff />
          </section>

          <section>
            <h2>よくある質問</h2>
            <dl className="divide-y divide-line rounded-2xl bg-surface">
              {GAS_COST_FAQS.map(({ q, a }) => (
                <div key={q} className="px-4 py-4">
                  <dt className="font-bold text-ink">{q}</dt>
                  <dd className="mt-1.5 text-sm leading-6 text-sub">{a}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        <nav aria-label="関連ページ" className="mt-12 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-6 text-sm text-sub">
          <Link href="/" className="inline-flex min-h-10 items-center hover:text-ink">FuelLens のトップ</Link>
          {otherToolLinks("/gas-cost").map((l) => (
            <Link key={l.href} href={l.href} className="inline-flex min-h-10 items-center hover:text-ink">{l.label}</Link>
          ))}
          <Link href="/privacy" className="inline-flex min-h-10 items-center hover:text-ink">プライバシーポリシー</Link>
          <Link href="/terms" className="inline-flex min-h-10 items-center hover:text-ink">利用規約</Link>
        </nav>
      </main>
    </div>
  );
}
