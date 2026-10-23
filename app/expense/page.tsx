import type { Metadata } from "next";
import Link from "next/link";
import { otherToolLinks } from "@/lib/publicNav";
import { Camera, ChevronRight } from "lucide-react";
import { PublicPageHeader } from "@/components/LegalPage";
import { RECORDS_CSV_HEADERS } from "@/lib/csv";
import { GAS_COST_PATH } from "@/lib/gasCostPage";
import {
  APPORTION_EXAMPLE_MONTHLY_COST,
  APPORTION_EXAMPLE_TOTAL_KM,
  APPORTION_EXAMPLE_WORK_KM,
  COST_PER_KM_PRICES,
  EXPENSE_DESCRIPTION,
  EXPENSE_PAGE_TITLE,
  EXPENSE_PATH,
  apportionByDistance,
  buildExpenseJsonLd,
  costPerKmTable,
  expenseFaqs,
} from "@/lib/expensePage";
import { aiAvailabilityCopy } from "@/lib/landingPage";
import { MAX_BATCH_IMAGES } from "@/lib/scan/batch";
import { isTrialEnabled } from "@/lib/server/analyze/trialCookie";

// ガソリン代を経費として記録したい人向けの入口（ログイン不要・静的）。新しい計算機は持たず、アプリの既存の機能を説明する。
// AI の読み取りの可否はお試し（TRIAL_COOKIE_SECRET）の有無で文言を切り替える（静的描画なのでビルド時の値）。
// OG 画像は同じフォルダの opengraph-image.tsx・twitter-image.tsx（ファイル規約）が付く。

export const metadata: Metadata = {
  title: { absolute: EXPENSE_PAGE_TITLE },
  description: EXPENSE_DESCRIPTION,
  alternates: { canonical: EXPENSE_PATH },
  openGraph: {
    title: EXPENSE_PAGE_TITLE,
    description: EXPENSE_DESCRIPTION,
    url: EXPENSE_PATH,
    type: "website",
    locale: "ja_JP",
    siteName: "FuelLens",
  },
  twitter: {
    card: "summary_large_image",
    title: EXPENSE_PAGE_TITLE,
    description: EXPENSE_DESCRIPTION,
  },
};

const linkClass = "text-accent underline underline-offset-2 hover:no-underline";

export default function ExpensePage() {
  const trialEnabled = isTrialEnabled();
  const aiCopy = aiAvailabilityCopy(trialEnabled);
  const faqs = expenseFaqs(trialEnabled);
  const example = apportionByDistance(APPORTION_EXAMPLE_MONTHLY_COST, APPORTION_EXAMPLE_TOTAL_KM, APPORTION_EXAMPLE_WORK_KM);
  const perKmTable = costPerKmTable();
  return (
    <div className="min-h-screen bg-ground font-sans text-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: buildExpenseJsonLd(faqs) }} />
      <PublicPageHeader />
      <main className="mx-auto max-w-[720px] px-4 pb-16 pt-8">
        <h1 className="text-2xl font-bold leading-9">
          ガソリン代の経費記録
          <span className="mt-1 block text-lg text-sub">レシートを撮るだけで日付・店名・金額を残す</span>
        </h1>
        <p className="mt-3 text-[15px] leading-7 text-sub">
          FuelLens は、ガソリンスタンドのレシートを撮ると、AI が日付・店名・給油量・単価・金額を読み取って記録するアプリです。
          ためた記録は CSV で書き出して、Excel やスプレッドシートで集計できます。
        </p>

        <div className="mt-10 space-y-10 text-[15px] leading-7 text-ink/90 [&_h2]:mb-3 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink [&_li]:mt-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p+p]:mt-2 [&_p+ul]:mt-2 [&_strong]:text-ink [&_ul]:list-disc [&_ul]:pl-5">
          <section>
            <h2>こんな人に</h2>
            <ul>
              <li>
                <strong>フードデリバリーの配達員。</strong>Uber Eats などで使うバイクや車のガソリン代を残せます。
              </li>
              <li>
                <strong>個人事業主・フリーランス。</strong>仕事で使った車両のガソリン代を一覧にまとめられます。
              </li>
              <li>
                <strong>営業車のガソリン代を自腹で立て替える会社員。</strong>精算のときに、いつ・どこでいくら給油したかを確かめられます。
              </li>
            </ul>
          </section>

          <section>
            <h2>レシートを撮って記録する</h2>
            <ol>
              <li>
                <strong>撮る。</strong>アプリの「スキャン」からレシートを撮影するか、アルバムから写真を選びます。
                AI が日付・店名・給油量・単価・支払総額・燃料の種類を読み取ります。
              </li>
              <li>
                <strong>確認する。</strong>読み取った値は保存前の確認画面で直せます。
              </li>
              <li>
                <strong>保存する。</strong>記録は車両ごとに残ります。車とバイクを何台でも登録でき、仕事用の車両を分けられます。
              </li>
            </ol>
            <p className="mt-3">
              ためたレシートは、アルバムで写真を複数枚（一度に <span className="num">{MAX_BATCH_IMAGES}</span> 枚まで）選ぶと、順に読み取れます（
              {trialEnabled ? "ログインせずに使うときは、お試しの残り回数の枚数まで" : "複数枚の読み取りはログイン後に使えます"}）。
            </p>
            <p>
              トリップメーターを一緒に写す（または手で入力する）と、前回の給油からの区間距離と満タン法の燃費も記録されます。
              メーターが写っていなければ距離は空欄で、燃費は計算されません。AI を使わず手で入力することもできます。
            </p>
          </section>

          <section>
            <h2>CSV で書き出して集計する</h2>
            <p>
              設定画面の「全車両のCSVを書き出す」で、全車両の記録を 1 つの CSV にできます。列は次のとおりです。
            </p>
            <ul aria-label="全車両 CSV の列" className="mt-3 flex! list-none! flex-wrap gap-2 pl-0!">
              {RECORDS_CSV_HEADERS.map((header) => (
                <li key={header} className="mt-0! rounded-lg border border-line bg-surface px-2.5 py-1 text-sm text-ink">
                  {header}
                </li>
              ))}
            </ul>
            <p className="mt-3">
              履歴画面の書き出しボタンからは、選んでいる車両の記録だけを書き出せます（車両の列はありません）。
              Excel で開いても文字化けしない形式（UTF-8・BOM 付き）です。
              月ごとの支払総額は、アプリの統計画面の「月ごとの給油代」でも見られます。
            </p>
          </section>

          <section>
            <h2>仕事とプライベートで使う車のガソリン代（按分の考え方）</h2>
            <p>
              1 台を仕事とプライベートで使うときは、ガソリン代を仕事の割合で分ける（按分する）方法がよく使われます。
              割合は走行距離や使用日数などで決め、決め方が分かる記録を残しておくと説明しやすくなります。
            </p>
            {example && (
              <>
                <p className="mt-3 font-bold text-ink">計算の例（走行距離で分ける場合）</p>
                <ul>
                  <li>
                    1 か月のガソリン代 <span className="num">{APPORTION_EXAMPLE_MONTHLY_COST.toLocaleString("ja-JP")}</span> 円、
                    走行距離 <span className="num">{APPORTION_EXAMPLE_TOTAL_KM.toLocaleString("ja-JP")}</span> km、
                    うち仕事で走った距離 <span className="num">{APPORTION_EXAMPLE_WORK_KM.toLocaleString("ja-JP")}</span> km の場合です。
                  </li>
                  <li>
                    仕事の割合は <span className="num">{APPORTION_EXAMPLE_WORK_KM}</span> ÷ <span className="num">{APPORTION_EXAMPLE_TOTAL_KM.toLocaleString("ja-JP")}</span> ＝{" "}
                    <span className="num">{example.ratioPercent}</span>%。
                  </li>
                  <li>
                    仕事分は <span className="num">{APPORTION_EXAMPLE_MONTHLY_COST.toLocaleString("ja-JP")}</span> 円 × <span className="num">{example.ratioPercent}</span>% ＝{" "}
                    <span className="num">{example.workCost.toLocaleString("ja-JP")}</span> 円（残りの <span className="num">{example.privateCost.toLocaleString("ja-JP")}</span> 円がプライベート分）。
                  </li>
                </ul>
              </>
            )}
            <p className="mt-3 text-sm text-sub">
              これは計算の例です。割合の決め方や経費にできる範囲は人によって異なるので、国税庁の案内や税理士に確認してください（リンクは下の「領収書の保管について」にあります）。
              FuelLens には、走行が仕事かプライベートかを区別して記録する機能はありません。仕事で走った距離は、運転日報など別の記録で残してください。
            </p>
          </section>

          <section>
            <h2>会社員の自腹精算・1km あたりのガソリン代の目安</h2>
            <p>
              ガソリン代を自腹で立て替えるときは、1km あたりのガソリン代（単価 ÷ 燃費）がめやすになります。
            </p>
            <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-surface">
              <table className="w-full border-collapse text-right text-sm">
                <caption className="sr-only">燃費と単価ごとの 1km あたりのガソリン代（円）</caption>
                <thead>
                  <tr className="border-b border-line text-sub">
                    <th scope="col" className="px-2.5 py-2.5 text-left font-medium">燃費＼単価</th>
                    {COST_PER_KM_PRICES.map((price) => (
                      <th key={price} scope="col" className="whitespace-nowrap px-2.5 py-2.5 font-medium">
                        <span className="num">{price}</span> 円/L
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {perKmTable.map(({ efficiency, costs }) => (
                    <tr key={efficiency} className="border-b border-line last:border-b-0">
                      <th scope="row" className="whitespace-nowrap px-2.5 py-2.5 text-left font-medium text-ink">
                        <span className="num">{efficiency}</span> km/L
                      </th>
                      {costs.map((cost, i) => (
                        <td key={COST_PER_KM_PRICES[i]} className="whitespace-nowrap px-2.5 py-2.5">
                          <span className="num">{cost}</span> 円/km
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-sub">
              単価・燃費は例で、小数第 2 位を四捨五入しています。会社に精算ルールがあれば、そちらに従ってください。
            </p>
            <p className="mt-2">
              自分の距離や燃費で計算するなら、
              <Link href={GAS_COST_PATH} className={linkClass}>
                ガソリン代計算
              </Link>
              をどうぞ。
            </p>
          </section>

          <section>
            <h2>領収書の保管について</h2>
            <p>
              FuelLens の記録は集計のための下書きです。レシートの原本はご自身で保管してください。原本（紙のレシートや電子データ）の保存要件は、
              <a href="https://www.nta.go.jp/" target="_blank" rel="noopener noreferrer" className={linkClass}>
                国税庁
              </a>
              の案内や税理士に確認してください。
            </p>
          </section>

          <section aria-labelledby="expense-cta" className="rounded-hero border border-accent/40 bg-surface p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-accent">
                <Camera className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2 id="expense-cta" className="mb-1! text-base! leading-6">
                  給油のたびにレシートを撮っておくなら FuelLens
                </h2>
                <p className="text-sm leading-6 text-sub">
                  レシートを撮るだけで、日付・店名・金額が車両ごとの記録になります。記録はいつでも CSV で書き出せます。
                  ログインするとクラウドに保存され、機種変更やパソコンからも同じ記録を使えます。
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
              <p className="text-xs text-sub">{aiCopy.calcNote}</p>
            </div>
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
          {otherToolLinks("/expense").map((l) => (
            <Link key={l.href} href={l.href} className="inline-flex min-h-10 items-center hover:text-ink">{l.label}</Link>
          ))}
          <Link href="/privacy" className="inline-flex min-h-10 items-center hover:text-ink">プライバシーポリシー</Link>
          <Link href="/terms" className="inline-flex min-h-10 items-center hover:text-ink">利用規約</Link>
        </nav>
      </main>
    </div>
  );
}
