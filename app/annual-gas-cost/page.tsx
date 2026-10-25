import type { Metadata } from "next";
import Link from "next/link";
import { otherToolLinks } from "@/lib/publicNav";
import { Camera, ChevronRight } from "lucide-react";
import { PublicPageHeader } from "@/components/LegalPage";
import {
  ANNUAL_GAS_COST_FAQS,
  ANNUAL_GAS_COST_PATH,
  COMMUTE_EXAMPLE,
  EXAMPLE_PRICE,
  MONTHLY_TABLE_EFFICIENCIES,
  buildAnnualGasCostJsonLd,
  buildMonthlyTable,
  commuteExample,
} from "@/lib/annualGasCostPage";
import AnnualGasCostCalculator from "./_components/AnnualGasCostCalculator";
import { aiAvailabilityCopy } from "@/lib/landingPage";
import { isTrialEnabled } from "@/lib/server/analyze/trialCookie";

// ログイン不要の年間・月間ガソリン代シミュレーター（検索からの入口）。計算機だけクライアント部品で、説明と FAQ は静的に描画する。

const TITLE = "年間・月間のガソリン代シミュレーター（通勤にも対応）| FuelLens";
const DESCRIPTION =
  "月間・年間の走行距離、または通勤の片道距離と出勤日数、燃費、ガソリン単価を入れるだけで、1か月と1年のガソリン代をすぐに計算。月間の給油量や1kmあたりの金額も出せます。計算式・早見表・通勤の例も掲載。登録不要・無料です。";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: ANNUAL_GAS_COST_PATH },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: ANNUAL_GAS_COST_PATH,
    type: "website",
    locale: "ja_JP",
    siteName: "FuelLens",
  },
};

const LINK = "text-accent underline underline-offset-2 hover:no-underline";

export default function AnnualGasCostPage() {
  const table = buildMonthlyTable();
  const commute = commuteExample();
  return (
    <div className="min-h-screen bg-ground font-sans text-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: buildAnnualGasCostJsonLd() }} />
      <PublicPageHeader />
      <main className="mx-auto max-w-[720px] px-4 pb-16 pt-8">
        <h1 className="text-2xl font-bold">年間・月間のガソリン代シミュレーター</h1>
        <p className="mt-2 text-[15px] leading-7 text-sub">
          走行距離、または通勤の片道距離と出勤日数から、1 か月と 1 年のガソリン代を計算します。
          月間の給油量や 1km あたりの金額も出せます。登録は不要で、入力した値は保存されません。
        </p>

        <div className="mt-6">
          <AnnualGasCostCalculator />
        </div>

        <div className="mt-12 space-y-10 text-[15px] leading-7 text-ink/90 [&_h2]:mb-3 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink [&_li]:mt-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p+p]:mt-2 [&_p+ul]:mt-2 [&_strong]:text-ink [&_ul]:list-disc [&_ul]:pl-5">
          <section>
            <h2>計算式</h2>
            <div className="rounded-2xl border border-line bg-surface px-4 py-4 text-center">
              <p className="text-base font-bold text-ink">月間走行距離（km）= 片道（km）× 2 × 月の出勤日数</p>
              <p className="mt-1 text-base font-bold text-ink">月のガソリン代（円）= 月間走行距離 ÷ 燃費（km/L）× 単価（円/L）</p>
              <p className="mt-1 text-base font-bold text-ink">年のガソリン代（円）= 月のガソリン代 × 12</p>
            </div>
            <p className="mt-3">
              通勤以外は、月間の走行距離をそのまま使います。年間の走行距離がわかっている場合は 12 で割れば月間になります。
            </p>
          </section>

          <section>
            <h2>早見表: 月間走行距離とガソリン代</h2>
            <p>
              単価 <span className="num">{EXAMPLE_PRICE}</span> 円/L で計算した例です。実際の単価で計算するときは上のツールを使ってください。
              各マスの上が月額、下が年額（月額 × 12）です。
            </p>
            <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-surface">
              <table className="w-full border-collapse text-right text-sm">
                <caption className="sr-only">月間走行距離と燃費ごとのガソリン代（円）。単価 {EXAMPLE_PRICE} 円/L の例。上が月額、下が年額</caption>
                <thead>
                  <tr className="border-b border-line text-sub">
                    <th scope="col" className="px-2.5 py-2.5 text-left font-medium">月間距離＼燃費</th>
                    {MONTHLY_TABLE_EFFICIENCIES.map((eff) => (
                      <th key={eff} scope="col" className="whitespace-nowrap px-2.5 py-2.5 font-medium">
                        <span className="num">{eff}</span> km/L
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.map(({ distance, cells }) => (
                    <tr key={distance} className="border-b border-line last:border-b-0">
                      <th scope="row" className="whitespace-nowrap px-2.5 py-2.5 text-left font-medium text-ink">
                        <span className="num">{distance.toLocaleString("ja-JP")}</span> km/月
                      </th>
                      {cells.map(({ monthly, yearly }, i) => (
                        <td key={MONTHLY_TABLE_EFFICIENCIES[i]} className="whitespace-nowrap px-2.5 py-2.5">
                          <span className="num block">{monthly} 円</span>
                          <span className="num block text-xs text-sub">{yearly} 円/年</span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-sub">1 円未満は四捨五入。年額は丸める前の月額を 12 倍して求めています。</p>
          </section>

          <section>
            <h2>通勤の例</h2>
            <p>
              片道 <span className="num">{COMMUTE_EXAMPLE.oneWayKm}</span> km、月 <span className="num">{COMMUTE_EXAMPLE.days}</span> 日出勤、
              燃費 <span className="num">{COMMUTE_EXAMPLE.efficiency}</span> km/L、単価 <span className="num">{EXAMPLE_PRICE}</span> 円/L（例）の場合です。
            </p>
            <ul>
              <li>
                月間の走行距離は <span className="num">{COMMUTE_EXAMPLE.oneWayKm}</span> × 2 × <span className="num">{COMMUTE_EXAMPLE.days}</span> ={" "}
                <span className="num">{commute.monthlyKm}</span> km です。
              </li>
              <li>
                月のガソリン代は <span className="num text-money">{commute.monthly}</span> 円、年のガソリン代は{" "}
                <span className="num text-money">{commute.yearly}</span> 円です。
              </li>
            </ul>
            <p className="mt-2 text-sm text-sub">休日の走行や寄り道は含みません。それらは「距離から」で別に計算して足してください。</p>
          </section>

          <section>
            <h2>ガソリン代を下げるには</h2>
            <ul>
              <li>
                <strong>実燃費を把握する。</strong>
                カタログ燃費と実際の燃費は異なることが多いので、満タン法で測っておくと見積もりも正確になります。測り方は
                <Link href="/calc" className={LINK}>
                  満タン法 燃費計算ツール
                </Link>
                で解説しています。
              </li>
              <li>
                <strong>単価の安いスタンドを選ぶ。</strong>同じ日でも、スタンドによって 1L あたりの価格は違います。
              </li>
              <li>
                <strong>走り方を見直す。</strong>急発進や急加速を控えると、燃費が変わることがあります。
              </li>
            </ul>
          </section>

          <section aria-labelledby="annual-gas-cost-cta" className="rounded-hero border border-accent/40 bg-surface p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-accent">
                <Camera className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2 id="annual-gas-cost-cta" className="mb-1! text-base! leading-6">
                  実際の月額も記録しておくなら FuelLens
                </h2>
                <p className="text-sm leading-6 text-sub">
                  記録しておけば、実燃費と実際の月額が分かります。FuelLens はレシートとトリップメーターが写った写真を撮るだけで、
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
          </section>

          <section>
            <h2>よくある質問</h2>
            <dl className="divide-y divide-line rounded-2xl bg-surface">
              {ANNUAL_GAS_COST_FAQS.map(({ q, a }) => (
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
          {otherToolLinks("/annual-gas-cost").map((l) => (
            <Link key={l.href} href={l.href} className="inline-flex min-h-10 items-center hover:text-ink">{l.label}</Link>
          ))}
          <Link href="/privacy" className="inline-flex min-h-10 items-center hover:text-ink">プライバシーポリシー</Link>
          <Link href="/terms" className="inline-flex min-h-10 items-center hover:text-ink">利用規約</Link>
        </nav>
      </main>
    </div>
  );
}
