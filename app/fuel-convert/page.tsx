import type { Metadata } from "next";
import Link from "next/link";
import { otherToolLinks } from "@/lib/publicNav";
import { Camera, ChevronRight } from "lucide-react";
import { PublicPageHeader } from "@/components/LegalPage";
import {
  FUEL_CONVERT_FAQS,
  FUEL_CONVERT_PATH,
  MILE_KM,
  QUICK_TABLE_KMPL,
  UK_GALLON_L,
  US_GALLON_L,
  buildFuelConvertJsonLd,
  buildQuickTable,
} from "@/lib/fuelConvertPage";
import FuelConvertCalculator from "./_components/FuelConvertCalculator";
import { aiAvailabilityCopy } from "@/lib/landingPage";
import { isTrialEnabled } from "@/lib/server/analyze/trialCookie";

// ログイン不要の燃費の単位換算ページ（検索からの入口）。換算機だけクライアント部品で、説明と FAQ は静的に描画する。

const TITLE = "燃費の単位換算ツール（km/L・L/100km・mpg）| FuelLens";
const DESCRIPTION =
  "km/L・L/100km・mpg（US/UK）の燃費を相互に換算。1つの値を入れるだけで4つの単位を同時に表示し、ガソリン単価から1kmあたりの燃料費も出せます。換算の式と早見表つき。登録不要・無料。";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: FUEL_CONVERT_PATH },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: FUEL_CONVERT_PATH,
    type: "website",
    locale: "ja_JP",
    siteName: "FuelLens",
  },
};

const linkClass = "text-accent underline underline-offset-2 hover:no-underline";

export default function FuelConvertPage() {
  const quickTable = buildQuickTable();
  return (
    <div className="min-h-screen bg-ground font-sans text-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: buildFuelConvertJsonLd() }} />
      <PublicPageHeader />
      <main className="mx-auto max-w-[720px] px-4 pb-16 pt-8">
        <h1 className="text-2xl font-bold">燃費の単位換算ツール（km/L・L/100km・mpg）</h1>
        <p className="mt-2 text-[15px] leading-7 text-sub">
          燃費を km/L、L/100km、mpg (US)、mpg (UK) の間で換算します。入力する単位を選んで値を入れると、ほかの 3 つの単位の値が同時に出ます。
          登録は不要で、入力した値は保存されません。
        </p>

        <div className="mt-6">
          <FuelConvertCalculator />
        </div>

        <div className="mt-12 space-y-10 text-[15px] leading-7 text-ink/90 [&_h2]:mb-3 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink [&_li]:mt-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p+p]:mt-2 [&_p+ul]:mt-2 [&_strong]:text-ink [&_ul]:list-disc [&_ul]:pl-5">
          <section>
            <h2>換算の式</h2>
            <div className="rounded-2xl border border-line bg-surface px-4 py-4 text-center">
              <p className="text-base font-bold text-ink">L/100km = 100 ÷ km/L</p>
              <p className="mt-1 text-base font-bold text-ink">
                mpg (US) = km/L × {US_GALLON_L} ÷ {MILE_KM}
                <span className="text-sm font-normal text-sub">（≒ km/L × 2.352）</span>
              </p>
              <p className="mt-1 text-base font-bold text-ink">
                mpg (UK) = km/L × {UK_GALLON_L} ÷ {MILE_KM}
                <span className="text-sm font-normal text-sub">（≒ km/L × 2.825）</span>
              </p>
              <p className="mt-2 text-sm text-sub">
                例: <span className="num">15</span> km/L = <span className="num text-accent">6.67</span> L/100km ={" "}
                <span className="num text-accent">35.28</span> mpg (US) = <span className="num text-accent">42.37</span> mpg (UK)
              </p>
            </div>
            <p className="mt-3">
              米ガロンは <span className="num">{US_GALLON_L}</span> L、英ガロンは <span className="num">{UK_GALLON_L}</span> L、1 マイルは{" "}
              <span className="num">{MILE_KM}</span> km です。ガロンの大きさが米英で違うため、同じ燃費でも mpg (US) と mpg (UK) の数値は変わります。
            </p>
          </section>

          <section>
            <h2>早見表</h2>
            <p>km/L から、ほかの単位への換算の目安です。上のツールと同じ式で求めています。</p>
            <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-surface">
              <table className="w-full border-collapse text-right text-sm">
                <caption className="sr-only">km/L ごとの L/100km、mpg (US)、mpg (UK)</caption>
                <thead>
                  <tr className="border-b border-line text-sub">
                    <th scope="col" className="whitespace-nowrap px-2.5 py-2.5 text-left font-medium">km/L</th>
                    <th scope="col" className="whitespace-nowrap px-2.5 py-2.5 font-medium">L/100km</th>
                    <th scope="col" className="whitespace-nowrap px-2.5 py-2.5 font-medium">mpg (US)</th>
                    <th scope="col" className="whitespace-nowrap px-2.5 py-2.5 font-medium">mpg (UK)</th>
                  </tr>
                </thead>
                <tbody>
                  {quickTable.map(({ kmpl, l100km, mpgUs, mpgUk }, i) => (
                    <tr key={QUICK_TABLE_KMPL[i]} className="border-b border-line last:border-b-0">
                      <th scope="row" className="whitespace-nowrap px-2.5 py-2.5 text-left font-medium text-ink">
                        <span className="num">{kmpl}</span> km/L
                      </th>
                      <td className="whitespace-nowrap px-2.5 py-2.5"><span className="num">{l100km}</span></td>
                      <td className="whitespace-nowrap px-2.5 py-2.5"><span className="num">{mpgUs}</span></td>
                      <td className="whitespace-nowrap px-2.5 py-2.5"><span className="num">{mpgUk}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-sub">小数第 3 位を四捨五入しています。</p>
          </section>

          <section>
            <h2>どこで使う単位か</h2>
            <ul>
              <li>
                <strong>km/L。</strong>日本で使われる単位です。カタログに載る WLTC モードや JC08 モードの燃費も km/L で表します。
              </li>
              <li>
                <strong>L/100km。</strong>欧州で使われる単位です。
              </li>
              <li>
                <strong>mpg (US)。</strong>米国で使われる単位です。米ガロンあたりに走れるマイル数を表します。
              </li>
              <li>
                <strong>mpg (UK)。</strong>英国で使われる単位です。英ガロン（インペリアルガロン）あたりに走れるマイル数を表します。
              </li>
            </ul>
            <p className="mt-3">
              海外の車の燃費を日本の感覚で比べたいときは、km/L に換算すると見比べやすくなります。自分の車の実燃費は
              <Link href="/calc" className={linkClass}>
                満タン法 燃費計算ツール
              </Link>
              で測れ、燃料費の見積もりは
              <Link href="/gas-cost" className={linkClass}>
                ガソリン代計算ツール
              </Link>
              で出せます。
            </p>
          </section>

          <section aria-labelledby="fuel-convert-cta" className="rounded-hero border border-accent/40 bg-surface p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-accent">
                <Camera className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2 id="fuel-convert-cta" className="mb-1! text-base! leading-6">
                  実燃費を記録しておくなら FuelLens
                </h2>
                <p className="text-sm leading-6 text-sub">
                  FuelLens はレシートとトリップメーターが写った写真を撮るだけで、AI が給油量・金額・区間距離を読み取り、満タン法で燃費を記録します。
                  燃費と給油代の推移もグラフで見られます。
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
              <p className="text-xs text-sub">{aiAvailabilityCopy(isTrialEnabled()).calcNote}</p>
            </div>
          </section>

          <section>
            <h2>よくある質問</h2>
            <dl className="divide-y divide-line rounded-2xl bg-surface">
              {FUEL_CONVERT_FAQS.map(({ q, a }) => (
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
          {otherToolLinks("/fuel-convert").map((l) => (
            <Link key={l.href} href={l.href} className="inline-flex min-h-10 items-center hover:text-ink">{l.label}</Link>
          ))}
          <Link href="/privacy" className="inline-flex min-h-10 items-center hover:text-ink">プライバシーポリシー</Link>
          <Link href="/terms" className="inline-flex min-h-10 items-center hover:text-ink">利用規約</Link>
        </nav>
      </main>
    </div>
  );
}
