import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, NotebookPen } from "lucide-react";
import { PublicPageHeader } from "@/components/LegalPage";
import AppQrHandoff from "@/components/AppQrHandoff";
import { otherGuideLinks, otherToolLinks } from "@/lib/publicNav";
import {
  FUEL_LOG_DESCRIPTION,
  FUEL_LOG_EXAMPLE,
  FUEL_LOG_ITEMS,
  FUEL_LOG_PAGE_TITLE,
  FUEL_LOG_PATH,
  PARTIAL_EXAMPLE,
  buildFuelLogJsonLd,
  fuelLogExample,
  fuelLogFaqs,
  partialExampleEfficiency,
} from "@/lib/fuelLogPage";
import { FUEL_LOG_EXCEL_PATH } from "@/lib/fuelLogExcelPage";
import { aiAvailabilityCopy } from "@/lib/landingPage";
import { isTrialEnabled } from "@/lib/server/analyze/trialCookie";

// 燃費を記録し続けたい人向けの入口（ログイン不要・静的）。新しい機能は持たず、記録のつけ方とアプリの既存の機能を説明する。
// AI の読み取りの可否はお試し（TRIAL_COOKIE_SECRET）の有無で文言を切り替える（静的描画なのでビルド時の値）。
// OG 画像は同じフォルダの opengraph-image.tsx・twitter-image.tsx（ファイル規約）が付く。

export const metadata: Metadata = {
  title: { absolute: FUEL_LOG_PAGE_TITLE },
  description: FUEL_LOG_DESCRIPTION,
  alternates: { canonical: FUEL_LOG_PATH },
  openGraph: {
    title: FUEL_LOG_PAGE_TITLE,
    description: FUEL_LOG_DESCRIPTION,
    url: FUEL_LOG_PATH,
    type: "website",
    locale: "ja_JP",
    siteName: "FuelLens",
  },
  twitter: {
    card: "summary_large_image",
    title: FUEL_LOG_PAGE_TITLE,
    description: FUEL_LOG_DESCRIPTION,
  },
};

const linkClass = "text-accent underline underline-offset-2 hover:no-underline";

export default function FuelLogPage() {
  const trialEnabled = isTrialEnabled();
  const aiCopy = aiAvailabilityCopy(trialEnabled);
  const faqs = fuelLogFaqs(trialEnabled);
  const example = fuelLogExample();
  const partial = partialExampleEfficiency();
  return (
    <div className="min-h-screen bg-ground font-sans text-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: buildFuelLogJsonLd(faqs) }} />
      <PublicPageHeader />
      <main className="mx-auto max-w-[720px] px-4 pb-16 pt-8">
        <h1 className="text-2xl font-bold leading-9">
          燃費記録のつけ方
          <span className="mt-1 block text-lg text-sub">満タン法で、給油のたびに 4 つの数字を残す</span>
        </h1>
        <p className="mt-3 text-[15px] leading-7 text-sub">
          燃費は 1 回測るより、給油のたびに記録を続けたほうが、車の調子や季節による違いが分かります。
          満タン法で記録するときに残す項目と、続けるためのコツをまとめました。
        </p>
        <p className="mt-2 text-sm">
          <Link href="/app" data-ga-cta="guide_top" className={linkClass}>
            写真 1 枚で記録できるアプリ（無料）を開く
          </Link>
        </p>

        <div className="mt-10 space-y-10 text-[15px] leading-7 text-ink/90 [&_h2]:mb-3 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink [&_li]:mt-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p+p]:mt-2 [&_p+ul]:mt-2 [&_strong]:text-ink [&_ul]:list-disc [&_ul]:pl-5">
          <section>
            <h2>給油のたびに残す項目</h2>
            <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
              <table className="w-full border-collapse text-left text-sm">
                <caption className="sr-only">燃費の記録に残す項目</caption>
                <thead>
                  <tr className="border-b border-line text-sub">
                    <th scope="col" className="px-3 py-2.5 font-medium">項目</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">どこを見るか</th>
                  </tr>
                </thead>
                <tbody>
                  {FUEL_LOG_ITEMS.map(({ name, how, required }) => (
                    <tr key={name} className="border-b border-line last:border-b-0">
                      <th scope="row" className="px-3 py-2.5 font-medium text-ink">
                        {name}
                        {!required && <span className="ml-1 text-xs font-normal text-sub">（任意）</span>}
                      </th>
                      <td className="px-3 py-2.5">{how}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3">
              燃費の分子は、前回の給油から走った<strong>区間距離</strong>です。メーターの積算距離（オドメーター）をそのまま使うと、燃費が大きくずれます。
            </p>
          </section>

          <section>
            <h2>記録の手順</h2>
            <ol>
              <li>満タンまで給油し、トリップメーターを 0 にします（最初の 1 回は基準づくりなので、燃費は出ません）。</li>
              <li>次も満タンまで給油したら、リセットする前にトリップメーターの区間距離を見て、レシートと一緒に記録します。</li>
              <li>
                燃費 ＝ 区間距離 ÷ 給油量。たとえば <span className="num">{FUEL_LOG_EXAMPLE.distance}</span> km を走って{" "}
                <span className="num">{FUEL_LOG_EXAMPLE.amount}</span> L 入ったなら、<span className="num">{example.efficiency.toFixed(1)}</span> km/L です。
                支払総額が <span className="num">{FUEL_LOG_EXAMPLE.cost.toLocaleString("ja-JP")}</span> 円なら、単価は{" "}
                <span className="num">{example.pricePerUnit}</span> 円/L です。
              </li>
              <li>トリップメーターを 0 に戻して、次の給油まで走ります。</li>
            </ol>
            <p className="mt-3">
              1 回分をすぐ計算したいときは<Link href="/calc" className={linkClass}>燃費計算</Link>を使えます。
            </p>
          </section>

          <section>
            <h2>部分給油と記録し忘れ</h2>
            <ul>
              <li>
                <strong>満タンにしなかった回も記録します。</strong>その回の燃費は出さず、次の満タン給油で区間距離と給油量を足して計算します。
                例: 部分給油で <span className="num">{PARTIAL_EXAMPLE.partialKm}</span> km・<span className="num">{PARTIAL_EXAMPLE.partialL}</span> L、
                次の満タンで <span className="num">{PARTIAL_EXAMPLE.fullKm}</span> km・<span className="num">{PARTIAL_EXAMPLE.fullL}</span> L なら、
                (<span className="num">{PARTIAL_EXAMPLE.partialKm}</span> + <span className="num">{PARTIAL_EXAMPLE.fullKm}</span>) ÷ (
                <span className="num">{PARTIAL_EXAMPLE.partialL}</span> + <span className="num">{PARTIAL_EXAMPLE.fullL}</span>) ＝{" "}
                <span className="num">{partial.toFixed(2)}</span> km/L です。
              </li>
              <li>
                <strong>記録し忘れた給油があったら、</strong>その間の給油量が分からないので、次に記録する給油の燃費は出さずに、そこから数え直します。
                無理に埋めると、燃費の平均が実際とずれます。
              </li>
            </ul>
          </section>

          <section>
            <h2>続けるコツ</h2>
            <ul>
              <li>
                <strong>給油したらその場で残す。</strong>トリップメーターをリセットする前と、レシートを捨てる前が記録のタイミングです。
              </li>
              <li>
                <strong>1 回の値より推移で見る。</strong>燃費は道路や天候で変わります。数回分の平均や、月ごとの変化で比べると傾向が分かります。
              </li>
              <li>
                <strong>計算は道具に任せる。</strong>手書きやメモアプリでも記録できますが、部分給油の合算や平均の計算が面倒になりがちです。
                エクセルで管理する方法は<Link href={FUEL_LOG_EXCEL_PATH} className={linkClass}>燃費管理をエクセルで</Link>にまとめています。
              </li>
            </ul>
          </section>

          <section>
            <h2>FuelLens で記録する</h2>
            <ul>
              <li>
                <strong>写真 1 枚で記録。</strong>レシートとトリップメーターを一緒に撮ると、AI が給油量・金額・区間距離などを読み取ります。
                保存前の確認画面で値を直せ、手入力もできます。
              </li>
              <li>
                <strong>部分給油と記録し忘れに対応。</strong>「満タン給油」を切ると部分給油、「前回の給油を記録し忘れた」に印を付けると数え直しとして、燃費を自動で計算します。
              </li>
              <li>
                <strong>統計とグラフ。</strong>燃費の推移・月ごとの給油代・単価の推移を見られます。車とバイクを何台でも登録できます。
              </li>
            </ul>
            <p className="mt-3">
              <Link href="/app" data-ga-cta="guide_inline" className={linkClass}>
                アプリで記録を始める
              </Link>
            </p>
          </section>

          <section aria-labelledby="fuel-log-cta" className="rounded-hero border border-accent/40 bg-surface p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-accent">
                <NotebookPen className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2 id="fuel-log-cta" className="mb-1! text-base! leading-6">
                  次の給油から、写真で燃費を記録する
                </h2>
                <p className="text-sm leading-6 text-sub">
                  レシートとメーターを撮るだけで、満タン法の燃費が記録に残ります。ログインするとクラウドに保存され、機種変更しても記録を引き継げます。
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
              {faqs.map(({ q, a }) => (
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
          {otherGuideLinks(FUEL_LOG_PATH).map((l) => (
            <Link key={l.href} href={l.href} className="inline-flex min-h-10 items-center hover:text-ink">{l.label}</Link>
          ))}
          {otherToolLinks(FUEL_LOG_PATH).map((l) => (
            <Link key={l.href} href={l.href} className="inline-flex min-h-10 items-center hover:text-ink">{l.label}</Link>
          ))}
          <Link href="/privacy" className="inline-flex min-h-10 items-center hover:text-ink">プライバシーポリシー</Link>
          <Link href="/terms" className="inline-flex min-h-10 items-center hover:text-ink">利用規約</Link>
        </nav>
      </main>
    </div>
  );
}
