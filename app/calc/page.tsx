import type { Metadata } from "next";
import Link from "next/link";
import { otherToolLinks } from "@/lib/publicNav";
import { Camera, ChevronRight } from "lucide-react";
import { PublicPageHeader } from "@/components/LegalPage";
import { CALC_DESCRIPTION, CALC_FAQS, CALC_H1, CALC_PAGE_TITLE, CALC_PATH, buildCalcJsonLd, calcQuickAnswerText } from "@/lib/calcPage";
import FuelCalculator from "./_components/FuelCalculator";
import { aiAvailabilityCopy } from "@/lib/landingPage";
import { isTrialEnabled } from "@/lib/server/analyze/trialCookie";
import AppQrHandoff from "@/components/AppQrHandoff";

// ログイン不要の燃費計算ページ（検索からの入口）。計算機だけクライアント部品で、説明と FAQ は静的に描画する。

const TITLE = CALC_PAGE_TITLE;
const DESCRIPTION = CALC_DESCRIPTION;

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: CALC_PATH },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: CALC_PATH,
    type: "website",
    locale: "ja_JP",
    siteName: "FuelLens",
  },
};

export default function CalcPage() {
  const aiCopy = aiAvailabilityCopy(isTrialEnabled());
  return (
    <div className="min-h-screen bg-ground font-sans text-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: buildCalcJsonLd() }} />
      <PublicPageHeader />
      <main className="mx-auto max-w-[720px] px-4 pb-16 pt-8">
        <h1 className="text-2xl font-bold">{CALC_H1}</h1>
        <p className="mt-3 rounded-2xl border border-accent/40 bg-surface px-4 py-3 text-[15px] font-bold leading-7 text-ink">
          {calcQuickAnswerText()}
        </p>
        <p className="mt-3 text-[15px] leading-7 text-sub">
          前回の満タン給油からの走行距離と、今回の給油量を入れるだけで燃費を計算します。
          支払総額を入れると、ガソリン単価と 1km あたりの燃料費も出ます。登録は不要です。
        </p>

        <div className="mt-6">
          <FuelCalculator trialNote={aiCopy.heroCheck} />
        </div>

        <div className="mt-12 space-y-10 text-[15px] leading-7 text-ink/90 [&_h2]:mb-3 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink [&_li]:mt-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p+p]:mt-2 [&_p+ul]:mt-2 [&_strong]:text-ink [&_ul]:list-disc [&_ul]:pl-5">
          <section>
            <h2>満タン法とは</h2>
            <p>
              満タン法は、満タンにしてから次に満タンにするまでに走った距離を、2 回目の給油量で割って燃費を求める方法です。
              満タンから満タンまで入れると、その区間で使った燃料がちょうど給油量になるので、特別な機器がなくても実燃費を測れます。
              距離は、前回の満タン給油でリセットしたトリップメーターの区間距離を使います。
              オドメーターは新車からの積算距離なので、そのまま入れず、前回の値との差にしてください。
            </p>
            <p className="mt-3 text-sm text-sub">
              距離からガソリン代を見積もるなら{" "}
              <Link href="/gas-cost" className="text-accent underline underline-offset-2 hover:no-underline">
                ガソリン代計算ツール
              </Link>
              、L/100km や mpg の燃費は{" "}
              <Link href="/fuel-convert" className="text-accent underline underline-offset-2 hover:no-underline">
                燃費の単位換算ツール
              </Link>
              をどうぞ。
            </p>
          </section>

          <section>
            <h2>正しく測るコツ</h2>
            <ul>
              <li>
                <strong>毎回満タンにする。</strong>給油機が自動で止まったところ（オートストップ）で終え、継ぎ足しはしません。
              </li>
              <li>
                <strong>同じスタンド・同じ止め方で入れる。</strong>給油機や車の傾きで、満タンの位置が少し変わるためです。
              </li>
              <li>
                <strong>満タンにしたらトリップメーターを 0 にリセットする。</strong>次の給油のときの表示が、そのまま区間距離になります。
              </li>
            </ul>
            <p className="mt-3 text-sm text-sub">1 回ごとの値はぶれやすいので、数回分を記録して平均を見ると傾向がつかめます。</p>
          </section>

          <section aria-labelledby="calc-cta" className="rounded-hero border border-accent/40 bg-surface p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-accent">
                <Camera className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2 id="calc-cta" className="mb-1! text-base! leading-6">
                  写真1枚で自動記録するなら FuelLens
                </h2>
                <p className="text-sm leading-6 text-sub">
                  レシートとトリップメーターが写った写真を撮るだけで、AI が給油量・金額・区間距離を読み取り、満タン法で燃費を記録します。
                  部分給油の合算や推移のグラフも自動です。
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
              <p className="text-xs text-sub">{aiCopy.calcNote}</p>
            </div>
            <AppQrHandoff />
          </section>

          <section>
            <h2>よくある質問</h2>
            <dl className="divide-y divide-line rounded-2xl bg-surface">
              {CALC_FAQS.map(({ q, a }) => (
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
          {otherToolLinks("/calc").map((l) => (
            <Link key={l.href} href={l.href} className="inline-flex min-h-10 items-center hover:text-ink">{l.label}</Link>
          ))}
          <Link href="/privacy" className="inline-flex min-h-10 items-center hover:text-ink">プライバシーポリシー</Link>
          <Link href="/terms" className="inline-flex min-h-10 items-center hover:text-ink">利用規約</Link>
        </nav>
      </main>
    </div>
  );
}
