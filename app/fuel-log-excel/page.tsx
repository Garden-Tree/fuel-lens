import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, FileSpreadsheet } from "lucide-react";
import { PublicPageHeader } from "@/components/LegalPage";
import AppQrHandoff from "@/components/AppQrHandoff";
import { otherGuideLinks, otherToolLinks } from "@/lib/publicNav";
import {
  EXCEL_MAX_FILE_MB,
  EXCEL_MAX_RECORDS,
  FUEL_LOG_EXCEL_DESCRIPTION,
  FUEL_LOG_EXCEL_PAGE_TITLE,
  FUEL_LOG_EXCEL_PATH,
  IFERROR_HELP_URL,
  OPTIONAL_COLUMNS,
  buildFuelLogExcelJsonLd,
  fuelLogExcelFaqs,
  sheetColumns,
} from "@/lib/fuelLogExcelPage";
import { FUEL_LOG_PATH } from "@/lib/fuelLogPage";
import { aiAvailabilityCopy } from "@/lib/landingPage";
import { isTrialEnabled } from "@/lib/server/analyze/trialCookie";

// 燃費をエクセルで管理している人・始めたい人向けの入口（ログイン不要・静的）。新しい機能は持たず、
// 列の作り方と、設定画面の既存の取り込み（FuelLens の CSV）で記録をアプリに移す方法を説明する。
// AI の読み取りの可否はお試し（TRIAL_COOKIE_SECRET）の有無で文言を切り替える（静的描画なのでビルド時の値）。
// OG 画像は同じフォルダの opengraph-image.tsx・twitter-image.tsx（ファイル規約）が付く。

export const metadata: Metadata = {
  title: { absolute: FUEL_LOG_EXCEL_PAGE_TITLE },
  description: FUEL_LOG_EXCEL_DESCRIPTION,
  alternates: { canonical: FUEL_LOG_EXCEL_PATH },
  openGraph: {
    title: FUEL_LOG_EXCEL_PAGE_TITLE,
    description: FUEL_LOG_EXCEL_DESCRIPTION,
    url: FUEL_LOG_EXCEL_PATH,
    type: "website",
    locale: "ja_JP",
    siteName: "FuelLens",
  },
  twitter: {
    card: "summary_large_image",
    title: FUEL_LOG_EXCEL_PAGE_TITLE,
    description: FUEL_LOG_EXCEL_DESCRIPTION,
  },
};

const linkClass = "text-accent underline underline-offset-2 hover:no-underline";

export default function FuelLogExcelPage() {
  const trialEnabled = isTrialEnabled();
  const aiCopy = aiAvailabilityCopy(trialEnabled);
  const faqs = fuelLogExcelFaqs(trialEnabled);
  const columns = sheetColumns();
  const fuelCol = columns.find((c) => c.header === "給油量(L)")!.letter;
  const distanceCol = columns.find((c) => c.header === "走行距離(km)")!.letter;
  return (
    <div className="min-h-screen bg-ground font-sans text-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: buildFuelLogExcelJsonLd(faqs) }} />
      <PublicPageHeader />
      <main className="mx-auto max-w-[720px] px-4 pb-16 pt-8">
        <h1 className="text-2xl font-bold leading-9">
          燃費管理をエクセルで
          <span className="mt-1 block text-lg text-sub">列の作り方と計算式、アプリへの移し方</span>
        </h1>
        <p className="mt-3 text-[15px] leading-7 text-sub">
          エクセルやスプレッドシートで燃費を管理するときの列と数式の例です。列名を FuelLens の CSV と同じにしておけば、
          あとからアプリに記録をまとめて取り込めます。
        </p>
        <p className="mt-2 text-sm">
          <Link href="/app" data-ga-cta="guide_top" className={linkClass}>
            写真 1 枚で記録できるアプリ（無料）を開く
          </Link>
        </p>

        <div className="mt-10 space-y-10 text-[15px] leading-7 text-ink/90 [&_h2]:mb-3 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink [&_li]:mt-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p+p]:mt-2 [&_p+ul]:mt-2 [&_strong]:text-ink [&_ul]:list-disc [&_ul]:pl-5">
          <section>
            <h2>列の作り方</h2>
            <p>1 行目に列名、2 行目から 1 回の給油を 1 行で書きます。単価と燃費の列は数式で出します。</p>
            <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-surface">
              <table className="w-full border-collapse text-left text-sm">
                <caption className="sr-only">燃費管理のシートの列の例</caption>
                <thead>
                  <tr className="border-b border-line text-sub">
                    <th scope="col" className="px-3 py-2.5 font-medium">列</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">1 行目（列名）</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">2 行目の例</th>
                  </tr>
                </thead>
                <tbody>
                  {columns.map(({ letter, header, input }) => (
                    <tr key={header} className="border-b border-line last:border-b-0">
                      <td className="px-3 py-2.5 text-sub">{letter}</td>
                      <th scope="row" className="whitespace-nowrap px-3 py-2.5 font-medium text-ink">{header}</th>
                      <td className="px-3 py-2.5">
                        <code className="break-all">{input}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3">
              燃費は <code>{distanceCol}2/{fuelCol}2</code>（区間距離 ÷ 給油量）です。
              <a href={IFERROR_HELP_URL} target="_blank" rel="noopener noreferrer" className={linkClass}>
                IFERROR
              </a>
              で包むと、給油量が空の行で #DIV/0! が出ません。数式は 3 行目より下へコピーします。
              走行距離の列には、オドメーターの積算距離ではなく、前回の給油からのトリップメーターの区間距離を書きます。
            </p>
          </section>

          <section>
            <h2>部分給油と平均燃費の注意</h2>
            <ul>
              <li>
                <strong>部分給油の行の燃費は使わない。</strong>満タンにしなかった回は 1 行ごとの燃費が正しくありません。
                次の満タンの行で、前の満タンの次の行からの区間距離と給油量をそれぞれ SUM で合計して割ります。
              </li>
              <li>
                <strong>平均燃費は合計どうしで割る。</strong>燃費の列を AVERAGE で平均すると、距離の短い回も長い回も同じ重みになります。
                期間の平均は、走行距離の合計 ÷ 給油量の合計で出します。
              </li>
            </ul>
            <p className="mt-3">
              記録の取り方そのものは<Link href={FUEL_LOG_PATH} className={linkClass}>燃費記録のつけ方</Link>にまとめています。
            </p>
          </section>

          <section>
            <h2>エクセルの記録を FuelLens に移す</h2>
            <ol>
              <li>
                列名を上の表の 8 つにそろえます（順番は自由。単価・燃費の列は空でもかまいません）。日付は 2026/11/12 のような年・月・日の形にします。
              </li>
              <li>
                Excel の「名前を付けて保存」で、ファイルの種類に「CSV UTF-8 (コンマ区切り)」か「CSV (コンマ区切り)」を選んで保存します（Web 版の Excel では CSV で保存できません）。
              </li>
              <li>
                FuelLens の
                <Link href="/settings" data-ga-cta="excel_import" className={linkClass}>
                  設定
                </Link>
                画面の「インポート」で「FuelLens の CSV を選ぶ」を押し、件数を確認して「取り込む」を押します。
              </li>
            </ol>
            <p className="mt-3">次の列を足すと、部分給油などもそのまま引き継げます。</p>
            <ul aria-label="任意で足せる列">
              {OPTIONAL_COLUMNS.map(({ header, input }) => (
                <li key={header}>
                  <strong>{header}</strong>: {input}
                </li>
              ))}
            </ul>
            <ul className="mt-3 text-sm text-sub">
              <li>
                車両の列の名前ごとに車両ができます（同じ名前の車両があればそこに追加）。新しく作る車両は、オドメーターの列に値があれば積算距離の差から区間距離を計算する方式になります。
              </li>
              <li>燃費は取り込んだ区間距離と給油量から計算し直すので、シートの燃費の値は使いません。</li>
              <li>
                日付が読めない行と、給油量も支払総額も無い行は読み飛ばします。ログインなしでも取り込め、ファイルは{" "}
                <span className="num">{EXCEL_MAX_FILE_MB}</span> MB・<span className="num">{EXCEL_MAX_RECORDS.toLocaleString("ja-JP")}</span> 件まで。
                取り込みは追記のみで、同じ記録はスキップします。
              </li>
            </ul>
          </section>

          <section aria-labelledby="fuel-log-excel-cta" className="rounded-hero border border-accent/40 bg-surface p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-accent">
                <FileSpreadsheet className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2 id="fuel-log-excel-cta" className="mb-1! text-base! leading-6">
                  入力と計算は、アプリに任せる
                </h2>
                <p className="text-sm leading-6 text-sub">
                  FuelLens なら、レシートとトリップメーターの写真から AI が給油量・金額・区間距離などを読み取ります。
                  部分給油の合算も自動で、燃費の推移や月ごとの給油代はグラフで見られます。
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
          {otherGuideLinks(FUEL_LOG_EXCEL_PATH).map((l) => (
            <Link key={l.href} href={l.href} className="inline-flex min-h-10 items-center hover:text-ink">{l.label}</Link>
          ))}
          {otherToolLinks(FUEL_LOG_EXCEL_PATH).map((l) => (
            <Link key={l.href} href={l.href} className="inline-flex min-h-10 items-center hover:text-ink">{l.label}</Link>
          ))}
          <Link href="/privacy" className="inline-flex min-h-10 items-center hover:text-ink">プライバシーポリシー</Link>
          <Link href="/terms" className="inline-flex min-h-10 items-center hover:text-ink">利用規約</Link>
        </nav>
      </main>
    </div>
  );
}
