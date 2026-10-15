import type { Metadata } from "next";
import Link from "next/link";
import { Camera, ChevronRight } from "lucide-react";
import { PublicPageHeader } from "@/components/LegalPage";
import { CALC_FAQS, CALC_PATH, buildCalcJsonLd } from "@/lib/calcPage";
import FuelCalculator from "./_components/FuelCalculator";

// ログイン不要の燃費計算ページ（検索からの入口）。計算機だけクライアント部品で、説明と FAQ は静的に描画する。

const TITLE = "満タン法 燃費計算ツール | FuelLens";
const DESCRIPTION =
  "走行距離と給油量を入れるだけで、満タン法の燃費（km/L）をすぐに計算。支払総額からガソリン単価（円/L）と1kmあたりの燃料費も出せます。正しい測り方のコツやよくある間違いも解説。登録不要・無料。";

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
  return (
    <div className="min-h-screen bg-ground font-sans text-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: buildCalcJsonLd() }} />
      <PublicPageHeader />
      <main className="mx-auto max-w-[720px] px-4 pb-16 pt-8">
        <h1 className="text-2xl font-bold">満タン法 燃費計算ツール</h1>
        <p className="mt-2 text-[15px] leading-7 text-sub">
          前回の満タン給油からの走行距離と、今回の給油量を入れるだけで燃費（km/L）を計算します。
          支払総額を入れると、ガソリン単価と 1km あたりの燃料費も出ます。登録は不要です。
        </p>

        <div className="mt-6">
          <FuelCalculator />
        </div>

        <div className="mt-12 space-y-10 text-[15px] leading-7 text-ink/90 [&_h2]:mb-3 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink [&_li]:mt-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p+p]:mt-2 [&_p+ul]:mt-2 [&_strong]:text-ink [&_ul]:list-disc [&_ul]:pl-5">
          <section>
            <h2>満タン法とは</h2>
            <p>
              満タン法は、燃料を満タンにしてから次に満タンにするまでに走った距離と、そのときに入った量から燃費を求める方法です。
              満タンからの「減った分」をちょうど補給するので、特別な機器がなくても実際の燃費（実燃費）を正確に測れます。
            </p>
          </section>

          <section>
            <h2>計算式</h2>
            <div className="rounded-2xl border border-line bg-surface px-4 py-4 text-center">
              <p className="text-base font-bold text-ink">
                燃費（km/L）= 区間距離（km）÷ 給油量（L）
              </p>
              <p className="mt-1 text-sm text-sub">
                例: <span className="num">400</span> km ÷ <span className="num">25</span> L ={" "}
                <span className="num text-accent">16.00</span> km/L
              </p>
            </div>
            <p className="mt-3">
              単価（円/L）は支払総額 ÷ 給油量、1km あたりの燃料費（円/km）は支払総額 ÷ 区間距離で求めます。
              上の例で支払総額が <span className="num">4,000</span> 円なら、単価は <span className="num">160.0</span> 円/L、
              1km あたり <span className="num">10.0</span> 円です。
            </p>
            <p className="mt-3 text-sm text-sub">
              距離からガソリン代を見積もるなら{" "}
              <Link href="/gas-cost" className="text-accent underline underline-offset-2 hover:no-underline">
                ガソリン代計算ツール
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
              <li>
                <strong>部分給油は次の満タンまで合算する。</strong>途中で満タンにしなかったときは、次に満タンにするまでの距離と給油量をすべて足してから割ります。
              </li>
            </ul>
            <p className="mt-3 text-sm text-sub">1 回ごとの値はぶれやすいので、数回分を記録して平均を見ると傾向がつかめます。</p>
          </section>

          <section>
            <h2>よくある間違い</h2>
            <ul>
              <li>
                <strong>走行距離にオドメーターの値を入れてしまう。</strong>
                オドメーターは新車からの積算距離です。前回の満タン給油からの区間距離（トリップメーター、または前回とのオドメーターの差）を使います。
              </li>
              <li>
                <strong>部分給油の量だけで割ってしまう。</strong>
                満タンでない給油の量は走った分より少ないため、燃費が実際より高く出ます。満タンにするまで合算してから計算します。
              </li>
            </ul>
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
          <Link href="/gas-cost" className="inline-flex min-h-10 items-center hover:text-ink">ガソリン代計算ツール</Link>
          <Link href="/privacy" className="inline-flex min-h-10 items-center hover:text-ink">プライバシーポリシー</Link>
          <Link href="/terms" className="inline-flex min-h-10 items-center hover:text-ink">利用規約</Link>
        </nav>
      </main>
    </div>
  );
}
