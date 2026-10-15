import type { Metadata } from "next";
import Link from "next/link";
import { Camera, ChevronRight } from "lucide-react";
import { PublicPageHeader } from "@/components/LegalPage";
import { GAS_COST_FAQS, GAS_COST_PATH, buildGasCostJsonLd } from "@/lib/gasCostPage";
import GasCostCalculator from "./_components/GasCostCalculator";

// ログイン不要のガソリン代計算ページ（検索からの入口）。計算機だけクライアント部品で、説明と FAQ は静的に描画する。

const TITLE = "ガソリン代計算ツール（距離・燃費・単価／往復・割り勘対応）| FuelLens";
const DESCRIPTION =
  "走行距離・燃費・ガソリン単価を入れるだけで、必要なガソリン量とガソリン代をすぐに計算。往復の距離や割り勘の1人あたりの金額、1kmあたりのガソリン代も出せます。計算式と、見積もりを正確にするコツもわかりやすく解説。登録不要・無料。";

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
  return (
    <div className="min-h-screen bg-ground font-sans text-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: buildGasCostJsonLd() }} />
      <PublicPageHeader />
      <main className="mx-auto max-w-[720px] px-4 pb-16 pt-8">
        <h1 className="text-2xl font-bold">ガソリン代計算ツール</h1>
        <p className="mt-2 text-[15px] leading-7 text-sub">
          走行距離・燃費・ガソリン単価から、必要なガソリン量とガソリン代を計算します。
          往復の距離や、割り勘したときの 1 人あたりの金額も出せます。登録は不要で、入力した値は保存されません。
        </p>

        <div className="mt-6">
          <GasCostCalculator />
        </div>

        <div className="mt-12 space-y-10 text-[15px] leading-7 text-ink/90 [&_h2]:mb-3 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink [&_li]:mt-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p+p]:mt-2 [&_p+ul]:mt-2 [&_strong]:text-ink [&_ul]:list-disc [&_ul]:pl-5">
          <section>
            <h2>計算式</h2>
            <div className="rounded-2xl border border-line bg-surface px-4 py-4 text-center">
              <p className="text-base font-bold text-ink">必要なガソリン量（L）= 走行距離（km）÷ 燃費（km/L）</p>
              <p className="mt-1 text-base font-bold text-ink">ガソリン代（円）= ガソリン量（L）× ガソリン単価（円/L）</p>
              <p className="mt-2 text-sm text-sub">
                例: <span className="num">300</span> km ÷ <span className="num">15</span> km/L ={" "}
                <span className="num">20</span> L、<span className="num">20</span> L × <span className="num">170</span> 円/L ={" "}
                <span className="num text-money">3,400</span> 円
              </p>
            </div>
            <p className="mt-3">
              例の単価（<span className="num">170</span> 円/L）は計算の説明のための値です。実際の単価は時期や地域、スタンドによって変わります。
              1km あたりのガソリン代（円/km）は、ガソリン単価 ÷ 燃費で求めます。上の例なら約 <span className="num">11.3</span> 円/km です。
            </p>
          </section>

          <section>
            <h2>往復と割り勘</h2>
            <ul>
              <li>
                <strong>往復は距離を 2 倍にする。</strong>「往復」を選ぶと、入力した片道の距離を 2 倍にして計算します。
              </li>
              <li>
                <strong>割り勘はガソリン代を人数で割る。</strong>人数を 2 人以上にすると、1 人あたりの金額を出します（1 円未満は切り上げ）。
              </li>
            </ul>
            <p className="mt-3 text-sm text-sub">高速料金や駐車場代は含みません。必要に応じて別に足してください。</p>
          </section>

          <section>
            <h2>正確に出すコツ</h2>
            <ul>
              <li>
                <strong>カタログ燃費より実燃費を使う。</strong>
                実際の走り方での燃費（実燃費）は、カタログ燃費と異なることが多いです。自分の車の燃費を満タン法で測っておくと、より正確に見積もれます。
                測り方は
                <Link href="/calc" className="text-accent underline-offset-2 hover:underline">
                  満タン法 燃費計算ツール
                </Link>
                で解説しています。
              </li>
              <li>
                <strong>単価は給油するスタンドの価格を入れる。</strong>
                同じ日でもスタンドによって単価は違います。給油する予定のスタンドの 1L あたりの価格を使います。
              </li>
            </ul>
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
                className="inline-flex h-11 items-center justify-center gap-1 rounded-xl bg-accent px-5 text-sm font-bold text-ground transition-colors hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                アプリを使う（無料）
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <p className="text-xs text-sub">ログイン不要で手動入力も使えます（AI の読み取りはログイン後）。</p>
            </div>
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
          <Link href="/calc" className="inline-flex min-h-10 items-center hover:text-ink">満タン法 燃費計算ツール</Link>
          <Link href="/privacy" className="inline-flex min-h-10 items-center hover:text-ink">プライバシーポリシー</Link>
          <Link href="/terms" className="inline-flex min-h-10 items-center hover:text-ink">利用規約</Link>
        </nav>
      </main>
    </div>
  );
}
