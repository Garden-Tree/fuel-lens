import type { Metadata } from "next";
import Link from "next/link";
import { otherToolLinks } from "@/lib/publicNav";
import { ChevronRight, FileSpreadsheet } from "lucide-react";
import { PublicPageHeader } from "@/components/LegalPage";
import {
  FUELIO_COLUMN_MAPPINGS,
  FUELIO_DESCRIPTION,
  FUELIO_HELP_URL,
  FUELIO_MAX_FILE_MB,
  FUELIO_MAX_RECORDS_TEXT,
  FUELIO_PAGE_TITLE,
  FUELIO_PATH,
  buildFuelioJsonLd,
  fuelioFaqs,
} from "@/lib/fuelioPage";
import { aiAvailabilityCopy } from "@/lib/landingPage";
import { isTrialEnabled } from "@/lib/server/analyze/trialCookie";

// Fuelio から乗り換える人向けの入口（ログイン不要・静的）。新しい機能は持たず、設定画面の既存の取り込みを説明する。
// AI の読み取りの可否はお試し（TRIAL_COOKIE_SECRET）の有無で文言を切り替える（静的描画なのでビルド時の値）。
// OG 画像は同じフォルダの opengraph-image.tsx・twitter-image.tsx（ファイル規約）が付く。

export const metadata: Metadata = {
  title: { absolute: FUELIO_PAGE_TITLE },
  description: FUELIO_DESCRIPTION,
  alternates: { canonical: FUELIO_PATH },
  openGraph: {
    title: FUELIO_PAGE_TITLE,
    description: FUELIO_DESCRIPTION,
    url: FUELIO_PATH,
    type: "website",
    locale: "ja_JP",
    siteName: "FuelLens",
  },
  twitter: {
    card: "summary_large_image",
    title: FUELIO_PAGE_TITLE,
    description: FUELIO_DESCRIPTION,
  },
};

const linkClass = "text-accent underline underline-offset-2 hover:no-underline";

export default function FuelioPage() {
  const trialEnabled = isTrialEnabled();
  const aiCopy = aiAvailabilityCopy(trialEnabled);
  const faqs = fuelioFaqs(trialEnabled);
  return (
    <div className="min-h-screen bg-ground font-sans text-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: buildFuelioJsonLd(faqs) }} />
      <PublicPageHeader />
      <main className="mx-auto max-w-[720px] px-4 pb-16 pt-8">
        <h1 className="text-2xl font-bold leading-9">
          Fuelio からの乗り換え
          <span className="mt-1 block text-lg text-sub">Fuelio の CSV を取り込んで、給油記録を引き継ぐ</span>
        </h1>
        <p className="mt-3 text-[15px] leading-7 text-sub">
          FuelLens は、Fuelio で書き出した CSV を設定画面から取り込めます。給油記録を引き継いで、そのまま続きを記録できます。
        </p>
        <p className="mt-2 text-xs leading-5 text-sub">
          FuelLens は Fuelio とは関係のない、別のサービスです。Fuelio の名称は、それぞれの権利者のものです。
        </p>

        <div className="mt-10 space-y-10 text-[15px] leading-7 text-ink/90 [&_h2]:mb-3 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink [&_li]:mt-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p+p]:mt-2 [&_p+ul]:mt-2 [&_strong]:text-ink [&_ul]:list-disc [&_ul]:pl-5">
          <section>
            <h2>Fuelio で CSV を書き出す</h2>
            <p>
              Fuelio の公式ヘルプでは、CSV の書き出しは「Settings / Backup / Export CSV」からと案内されています。
              メニューの名前はバージョンや言語で異なることがあるので、詳しくは
              <a href={FUELIO_HELP_URL} target="_blank" rel="noopener noreferrer" className={linkClass}>
                Fuelio の公式ヘルプ
              </a>
              を確認してください。
            </p>
            <p>
              距離は km、給油量は L で書き出してください。マイルやガロンの CSV には対応していません。
            </p>
          </section>

          <section>
            <h2>FuelLens で取り込む</h2>
            <ol>
              <li>
                <Link href="/settings" className={linkClass}>
                  設定
                </Link>
                画面の「インポート」にある「Fuelio の CSV を選ぶ」を押して、書き出した CSV ファイルを選びます。
              </li>
              <li>
                取り込み先の車両名と種別（自動車・バイク）を確認します。Fuelio の情報から推定した値が入っているので、必要なら直せます。
                名前と種別が同じ車両がすでにあれば、その車両に追加されます。
              </li>
              <li>
                件数と注意書きを確認して「取り込む」を押します。
              </li>
            </ol>
            <p className="mt-3">
              ログインなしでも取り込めます（このブラウザに保存。ログイン中はクラウドのデータに追加）。
              ファイルの大きさは <span className="num">{FUELIO_MAX_FILE_MB}</span> MB まで、記録は <span className="num">{FUELIO_MAX_RECORDS_TEXT}</span> 件までです。
            </p>
          </section>

          <section>
            <h2>取り込まれる内容</h2>
            <p>Fuelio の CSV のうち、車両の情報（1 台目）と給油記録（Log）を読み込みます。</p>
            <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-surface">
              <table className="w-full border-collapse text-left text-sm">
                <caption className="sr-only">Fuelio の列と FuelLens の項目の対応</caption>
                <thead>
                  <tr className="border-b border-line text-sub">
                    <th scope="col" className="px-3 py-2.5 font-medium">Fuelio の列</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">FuelLens の項目</th>
                  </tr>
                </thead>
                <tbody>
                  {FUELIO_COLUMN_MAPPINGS.map(({ fuelio, fuellens, note }) => (
                    <tr key={fuelio} className="border-b border-line last:border-b-0">
                      <th scope="row" className="whitespace-nowrap px-3 py-2.5 font-medium text-ink">{fuelio}</th>
                      <td className="px-3 py-2.5">
                        {fuellens}
                        {note && <span className="block text-xs text-sub">{note}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="mt-3">
              <li>
                <strong>車両はオドメーター方式で作られます。</strong>すでにある車両に追加するときは、その車両の設定のままです。
                トリップ入力方式の車両に追加した記録は、区間距離と燃費が計算されません。
              </li>
              <li>
                <strong>燃費は積算距離の差から計算し直します。</strong>Fuelio の燃費の値は使わず、満タン法で求めます。部分給油は次の満タン給油でまとめて計算します。
                最初の 1 件、記録漏れ（Missed）の給油、積算距離が前回以下の記録は燃費が出ません。
              </li>
              <li>
                <strong>対象外のデータ。</strong>タンクが 2 つある車両は 1 本目の記録だけです。日付や給油量・金額が読めない行と、その他の費用の記録は取り込みません。
              </li>
            </ul>
          </section>

          <section>
            <h2>重複と既存データの扱い</h2>
            <ul>
              <li>
                <strong>追記のみ。</strong>FuelLens にある記録は削除も上書きもされません。Fuelio 側の記録にも触れないので、そのまま残ります。
              </li>
              <li>
                <strong>同じ記録はスキップ。</strong>同じ ID、または同じ車両・日付・ほぼ同じ給油量・同じ支払総額の記録はスキップされるので、同じ CSV をもう一度選んでも二重には増えません。
                同じ日に同じ給油量と金額の別の給油があるときも、同じ記録とみなされます。
              </li>
            </ul>
          </section>

          <section>
            <h2>乗り換えたあとにできること</h2>
            <ul>
              <li>
                <strong>写真で記録。</strong>レシートとトリップメーターの写真から、AI が給油量・金額・区間距離などを読み取ります。
              </li>
              <li>
                <strong>統計とグラフ。</strong>燃費の推移や月ごとの給油代を統計画面で見られます。
              </li>
              <li>
                <strong>複数の車両。</strong>車とバイクを何台でも登録できます。
              </li>
            </ul>
          </section>

          <section aria-labelledby="fuelio-cta" className="rounded-hero border border-accent/40 bg-surface p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-accent">
                <FileSpreadsheet className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2 id="fuelio-cta" className="mb-1! text-base! leading-6">
                  Fuelio の記録を FuelLens に引き継ぐ
                </h2>
                <p className="text-sm leading-6 text-sub">
                  CSV を書き出したら、設定画面の「インポート」から取り込めます。取り込んだあとも、Fuelio の記録は消えません。
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
              <Link href="/settings" className={`${linkClass} text-sm`}>
                設定の「インポート」を開く
              </Link>
            </div>
            <p className="mt-3 text-xs text-sub">{aiCopy.calcNote}</p>
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
          {otherToolLinks("/fuelio").map((l) => (
            <Link key={l.href} href={l.href} className="inline-flex min-h-10 items-center hover:text-ink">{l.label}</Link>
          ))}
          <Link href="/privacy" className="inline-flex min-h-10 items-center hover:text-ink">プライバシーポリシー</Link>
          <Link href="/terms" className="inline-flex min-h-10 items-center hover:text-ink">利用規約</Link>
        </nav>
      </main>
    </div>
  );
}
