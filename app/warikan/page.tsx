import type { Metadata } from "next";
import Link from "next/link";
import { Camera, ChevronRight } from "lucide-react";
import { otherToolLinks } from "@/lib/publicNav";
import { PublicPageHeader } from "@/components/LegalPage";
import {
  WARIKAN_CALCULATOR_ID,
  WARIKAN_DESCRIPTION,
  WARIKAN_EXAMPLE,
  WARIKAN_FAQS,
  WARIKAN_PAGE_TITLE,
  WARIKAN_PATH,
  buildWarikanJsonLd,
  formatYen,
  warikanExample,
} from "@/lib/warikanPage";
import WarikanCalculator from "./_components/WarikanCalculator";
import { aiAvailabilityCopy } from "@/lib/landingPage";
import { isTrialEnabled } from "@/lib/server/analyze/trialCookie";

// ログイン不要のガソリン代の割り勘ページ（「ガソリン代 割り勘」の検索からの入口）。計算機だけクライアント部品で、ページは静的。

const TITLE = WARIKAN_PAGE_TITLE;
const DESCRIPTION = WARIKAN_DESCRIPTION;

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: WARIKAN_PATH },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: WARIKAN_PATH,
    type: "website",
    locale: "ja_JP",
    siteName: "FuelLens",
  },
};

export default function WarikanPage() {
  const example = warikanExample();
  const exampleKm = Number(WARIKAN_EXAMPLE.distance) * 2;
  const yen = (value: number | null) => (value != null ? formatYen(value) : "");
  return (
    <div className="min-h-screen bg-ground font-sans text-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: buildWarikanJsonLd() }} />
      <PublicPageHeader />
      <main className="mx-auto max-w-[720px] px-4 pb-16 pt-8">
        <h1 className="text-2xl font-bold">ガソリン代の割り勘計算</h1>
        <p className="mt-2 text-[15px] leading-7 text-sub">
          距離・燃費・ガソリン単価・人数から、ドライブや帰省のガソリン代を割り勘したときの 1 人あたりを計算します。
          高速代や駐車場代も足せて、結果は LINE やリンクで同乗者に送れます。
        </p>

        <div id={WARIKAN_CALCULATOR_ID} className="mt-6 scroll-mt-4">
          <WarikanCalculator />
        </div>

        <div className="mt-12 space-y-10 text-[15px] leading-7 text-ink/90 [&_h2]:mb-3 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink [&_li]:mt-1.5 [&_p+p]:mt-2 [&_p+ul]:mt-2 [&_strong]:text-ink [&_ul]:list-disc [&_ul]:pl-5">
          <section>
            <h2>計算式</h2>
            <div className="rounded-2xl border border-line bg-surface px-4 py-4 text-center">
              <p className="text-base font-bold text-ink">ガソリン代（円）= 走行距離（km）÷ 燃費（km/L）× 単価（円/L）</p>
              <p className="mt-1 text-base font-bold text-ink">1 人あたり（円）=（ガソリン代 ＋ 高速代など）÷ 払う人数</p>
              <p className="mt-2 text-sm text-sub">
                例: 往復 <span className="num">{exampleKm}</span> km・<span className="num">{WARIKAN_EXAMPLE.efficiency}</span> km/L・
                <span className="num">{WARIKAN_EXAMPLE.price}</span> 円/L でガソリン代 <span className="num">{yen(example.all.fuelCost)}</span> 円。
                高速代 <span className="num">{yen(example.all.toll)}</span> 円を足した <span className="num">{yen(example.all.total)}</span> 円を{" "}
                <span className="num">{WARIKAN_EXAMPLE.people}</span> 人で割ると 1 人{" "}
                <span className="num text-money">{yen(example.all.perPerson)}</span> 円（100 円単位で切り上げ）
              </p>
            </div>
            <p className="mt-3">
              1 人あたりは、選んだ単位（1 円・10 円・100 円）で切り上げます。切り上げるのは集めた額が合計に足りなくならないようにするためで、
              その分だけ合計より少し多く集まります（上の例では <span className="num">{yen(example.all.collected)}</span> 円）。
            </p>
          </section>

          <section>
            <h2>運転手の分の考え方</h2>
            <p>割り勘の仕方に決まりはありません。よく使われるのは次の 2 つで、計算機の「運転手の分」で切り替えられます。</p>
            <ul>
              <li>
                <strong>全員で均等。</strong>運転手も含めた全員で割ります。上の例なら 1 人{" "}
                <span className="num">{yen(example.all.perPerson)}</span> 円。交代で運転するときなどに向きます。
              </li>
              <li>
                <strong>運転手は払わない。</strong>運転の負担を考えて、同乗者だけで割ります。上の例なら{" "}
                <span className="num">{example.exclude.payers}</span> 人で割って 1 人 <span className="num">{yen(example.exclude.perPerson)}</span>{" "}
                円です。
              </li>
            </ul>
            <p className="mt-3">
              車の持ち主には、ガソリン代のほかにタイヤやオイルの消耗、保険などの費用もかかっています。どちらで割るか、
              高速代などの欄に少し上乗せするかを出発前に決めておくと、精算のときに迷いません。
            </p>
          </section>

          <section aria-labelledby="warikan-cta" className="rounded-hero border border-accent/40 bg-surface p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-accent">
                <Camera className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2 id="warikan-cta" className="mb-1! text-base! leading-6">
                  実燃費を記録しておくなら FuelLens
                </h2>
                <p className="text-sm leading-6 text-sub">
                  実燃費が分かっていれば、割り勘の金額も実際に近くなります。FuelLens はレシートとトリップメーターが写った写真を撮るだけで、
                  AI が給油量・金額・区間距離を読み取り、満タン法で燃費を記録します。
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
              {WARIKAN_FAQS.map(({ q, a }) => (
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
          {otherToolLinks(WARIKAN_PATH).map((l) => (
            <Link key={l.href} href={l.href} className="inline-flex min-h-10 items-center hover:text-ink">{l.label}</Link>
          ))}
          <Link href="/privacy" className="inline-flex min-h-10 items-center hover:text-ink">プライバシーポリシー</Link>
          <Link href="/terms" className="inline-flex min-h-10 items-center hover:text-ink">利用規約</Link>
        </nav>
      </main>
    </div>
  );
}
