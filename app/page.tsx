import Link from "next/link";
import {
  Sparkles,
  Calculator,
  BarChart3,
  History,
  ChevronRight,
  Download,
  Car,
  CheckCircle2,
} from "lucide-react";
import { BrandMark } from "@/components/ui";
import HeaderAuthButtons from "@/components/landing/HeaderAuthButtons";
import HeroPhonePreview from "@/components/landing/HeroPhonePreview";
import DemoSimulator from "@/components/landing/DemoSimulator";
import FaqAccordion, { type FaqItem } from "@/components/landing/FaqAccordion";

// このページは Server Component。インタラクティブな部分（ログインボタン・スマホモック・デモ・FAQ）だけを
// components/landing/ 配下の小さなクライアントコンポーネントに切り出している。

const faqs: FaqItem[] = [
  {
    q: "本当に無料で使えますか？",
    a: "はい、AI解析を含めたすべての基本機能を無料でご利用いただけます。広告や追加課金の心配なく、燃費管理を始めていただけます（AI解析のみログインが必要です）。",
  },
  {
    q: "ユーザー登録は必須ですか？",
    a: "いいえ、ユーザー登録なしでも「ローカル保存モード」として手動入力・履歴・グラフをすぐにご利用いただけます（データはお使いのブラウザに保存されます）。ただし、写真からのAI解析はログイン後にご利用いただけます。記録をクラウドに保存して機種変更時やパソコンなど複数端末で共有したい場合も、ログインしてご利用ください。",
  },
  {
    q: "レシートとメーターは別々に撮影する必要がありますか？",
    a: "いいえ、レシートとトリップメーターが同時に写った写真1枚を撮影（またはアップロード）してください。AIが1枚の写真から、給油情報（給油量・金額・店舗名など）と、トリップメーターの区間走行距離（前回給油からの距離）を同時に解析して抽出します。",
  },
  {
    q: "AIの文字認識精度はどのくらいですか？",
    a: "GoogleのAI「Gemini」を活用しているため、夜間の暗いガソリンスタンドで撮影された写真や、多少斜めから撮られたレシートでも高い精度で数字を抽出します。万が一、数字の誤認識があった場合でも、保存前に確認・修正でき、保存後も編集できます。",
  },
  {
    q: "どのような車種に対応していますか？",
    a: "ガソリン車、ディーゼル車、ハイブリッド車、バイクなど、トリップメーター（区間距離計）の値と給油量から満タン法で燃費計算ができるすべての車両に対応しています。また、複数車両の登録機能により、マイカーと会社の車など複数台の管理も1つのアカウントで可能です。",
  },
];

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-ground font-sans text-ink selection:bg-accent selection:text-ground">

      {/* ヘッダーナビゲーション */}
      <header className="sticky top-0 z-50 border-b border-line bg-ground/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <BrandMark className="text-lg" />

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-sub">
            <a href="#features" className="hover:text-ink transition">機能</a>
            <a href="#demo" className="hover:text-ink transition">体験デモ</a>
            <a href="#how-to" className="hover:text-ink transition">使い方</a>
            <a href="#faq" className="hover:text-ink transition">よくある質問</a>
          </nav>

          <HeaderAuthButtons />
        </div>
      </header>

      {/* ヒーローセクション */}
      <section className="relative pt-12 pb-16 sm:pt-20 md:pt-32 md:pb-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* 左側テキストコンテンツ */}
            <div className="lg:col-span-6 text-center lg:text-left space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-surface text-xs font-semibold text-accent">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Google Gemini AI が1枚の写真を自動解析</span>
              </div>
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold leading-tight text-ink tracking-tight">
                車の給油をもっと<br />スマートに。<br />
                <span className="text-accent">
                  写真1枚で<br />燃費を自動管理
                </span>
              </h1>
              <p className="text-base sm:text-lg text-sub max-w-xl mx-auto lg:mx-0 leading-relaxed">
                給油時のレシートと車のトリップメーターが同時に写った写真をスマホで1枚パシャリと撮るだけ。
                AIが自動的に給油量・金額・区間走行距離を読み取り、満タン法で燃費を即時に計算・記録します。手入力のストレスから解放されましょう。
              </p>

              <div className="pt-4 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
                <Link
                  href="/app"
                  className="w-full sm:w-auto text-center bg-scan-gradient text-white font-bold px-8 py-4 rounded-2xl transition active:scale-95 hover:brightness-110 text-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-ground"
                >
                  無料で使ってみる
                </Link>
                <a
                  href="#demo"
                  className="w-full sm:w-auto text-center bg-surface hover:bg-surface-2 text-ink font-semibold px-6 py-4 rounded-2xl border border-border transition active:scale-95 text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  機能を体験する
                </a>
              </div>

              <div className="pt-6 flex flex-wrap items-center justify-center lg:justify-start gap-x-6 gap-y-2 text-xs text-sub">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-money" /> 手動入力・ローカル保存は登録不要
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-money" /> 写真1枚のアップロードで完結
                </span>
              </div>
            </div>

            {/* 右側：アプリのコンポーネントを再現したリアルプレビューUI */}
            <div className="lg:col-span-6 relative flex justify-center">
              <HeroPhonePreview />

              {/* フローティングデコレーション */}
              {/* スマホ幅ではモックに重なり画面外にはみ出すため sm 以上でだけ表示する */}
              <div className="hidden sm:flex absolute top-1/4 -left-6 bg-surface border border-border p-3.5 rounded-2xl shadow-xl shadow-black/40 items-center gap-3 animate-bounce duration-1000 max-w-[170px]">
                <div className="w-8 h-8 rounded-lg bg-up-bg flex items-center justify-center text-money">
                  <Calculator className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[10px] text-sub">給油単価</p>
                  <p className="num text-xs font-bold text-ink">¥155/L</p>
                </div>
              </div>

              <div className="hidden sm:flex absolute bottom-1/4 -right-8 bg-surface border border-border p-3.5 rounded-2xl shadow-xl shadow-black/40 items-center gap-3 max-w-[170px]">
                <div className="w-8 h-8 rounded-lg bg-surface-2 flex items-center justify-center text-accent">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[10px] text-sub">AI OCR解析</p>
                  <p className="text-xs font-bold text-ink">1枚の画像から自動抽出</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 特徴・機能紹介セクション */}
      <section id="features" className="py-20 border-y border-line bg-surface/40 relative">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16 space-y-4">
            <h2 className="text-xs font-bold tracking-widest text-accent uppercase">FEATURES</h2>
            <p className="text-3xl sm:text-4xl font-bold text-ink">燃費管理に必要な、すべての機能</p>
            <p className="text-sm sm:text-base text-sub">
              面倒な手計算やメモ書きはもう必要ありません。スマートな車生活をサポートする機能を取り揃えました。
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* 特徴カード 1 */}
            <div className="bg-surface border border-line rounded-hero p-6">
              <div className="w-12 h-12 rounded-2xl bg-surface-2 flex items-center justify-center mb-6 text-accent">
                <Sparkles className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-ink mb-2">1枚の写真からAI自動読取</h3>
              <p className="text-sm text-sub leading-relaxed">
                レシートの給油データとトリップメーター（前回給油からの区間距離）が同時に写った写真を撮影するだけ。Gemini AIが給油量・金額・走行距離・日付・店舗名をまとめて抽出します。※AI解析はログイン後に利用できます。
              </p>
            </div>

            {/* 特徴カード 2 */}
            <div className="bg-surface border border-line rounded-hero p-6">
              <div className="w-12 h-12 rounded-2xl bg-surface-2 flex items-center justify-center mb-6 text-accent">
                <Calculator className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-ink mb-2">燃費の自動計算（満タン法）</h3>
              <p className="text-sm text-sub leading-relaxed">
                トリップメーターの区間走行距離 ÷ 今回の給油量 で実燃費（km/L）を算出。支払総額と給油量からガソリン単価（円/L）も自動で計算します。
              </p>
            </div>

            {/* 特徴カード 3 */}
            <div className="bg-surface border border-line rounded-hero p-6">
              <div className="w-12 h-12 rounded-2xl bg-surface-2 flex items-center justify-center mb-6 text-cost-up">
                <BarChart3 className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-ink mb-2">グラフで支出と燃費の推移を可視化</h3>
              <p className="text-sm text-sub leading-relaxed">
                季節ごとの燃費の変化や、ガソリン価格の高騰状況、月ごとの給油総額を綺麗なチャートで可視化。愛車のコンディション管理にも役立ちます。
              </p>
            </div>

            {/* 特徴カード 4 */}
            <div className="bg-surface border border-line rounded-hero p-6">
              <div className="w-12 h-12 rounded-2xl bg-surface-2 flex items-center justify-center mb-6 text-money">
                <Car className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-ink mb-2">複数車両の登録・個別管理</h3>
              <p className="text-sm text-sub leading-relaxed">
                マイカー、セカンドカー、仕事用のバンなど、複数の車両を登録して、個別に燃費データや給油履歴を切り替え管理することができます。
              </p>
            </div>

            {/* 特徴カード 5 */}
            <div className="bg-surface border border-line rounded-hero p-6">
              <div className="w-12 h-12 rounded-2xl bg-surface-2 flex items-center justify-center mb-6 text-accent">
                <Download className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-ink mb-2">CSVデータエクスポート</h3>
              <p className="text-sm text-sub leading-relaxed">
                これまでに記録した全データをワンクリックでCSV形式で出力可能。Excelで自由にグラフを編集したり、家計簿ソフトに取り込んだりできます。
              </p>
            </div>

            {/* 特徴カード 6 */}
            <div className="bg-surface border border-line rounded-hero p-6">
              <div className="w-12 h-12 rounded-2xl bg-surface-2 flex items-center justify-center mb-6 text-warn">
                <History className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-ink mb-2">クラウド同期 & ローカル体験</h3>
              <p className="text-sm text-sub leading-relaxed">
                未ログインでも手動入力した記録はブラウザ内（ローカル）に保存されます。ログインすると記録がクラウド（Supabase）に保存され、PCやタブレットでも同期。AIによる写真解析はログイン後に利用できます。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 体験デモ（スキャンシミュレーター）セクション */}
      <section id="demo" className="py-20 relative">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-12 space-y-4">
            <h2 className="text-xs font-bold tracking-widest text-accent uppercase">INTERACTIVE DEMO</h2>
            <p className="text-3xl font-bold text-ink">AIの読み取りを10秒で体験</p>
            <p className="text-sm text-sub">
              以下のシミュレーターで「デモ写真を解析」ボタンをクリックして、どのようにAIが写真を認識し燃費を算出するのかを体験してみてください。
            </p>
          </div>

          <DemoSimulator />
        </div>
      </section>

      {/* 使い方（ステップ）セクション */}
      <section id="how-to" className="py-20 border-y border-line bg-surface/40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16 space-y-4">
            <h2 className="text-xs font-bold tracking-widest text-accent uppercase">HOW IT WORKS</h2>
            <p className="text-3xl sm:text-4xl font-bold text-ink">たった3ステップの簡単管理</p>
            <p className="text-sm text-sub">
              給油時にサッとスマホを取り出すだけ。1回10秒の簡単なオペレーションです。
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 relative">
            {/* バックグラウンドライン（デスクトップ用） */}
            <div className="hidden lg:block absolute top-[50px] left-[15%] right-[15%] h-px bg-line z-0" />

            {/* ステップ 1 */}
            <div className="flex flex-col items-center text-center space-y-4 relative z-10">
              <div className="num w-16 h-16 rounded-full bg-surface border-2 flex items-center justify-center font-bold text-xl border-accent text-accent">
                1
              </div>
              <h3 className="text-lg font-bold text-ink">レシートとトリップメーターを同時に撮影</h3>
              <p className="text-sm text-sub max-w-xs">
                満タン給油後、レシートと車のトリップメーター（前回給油からの区間距離）が同時に写った写真をスマートフォンで1枚撮影します。撮影したらトリップメーターをリセットしておきましょう。
              </p>
            </div>

            {/* ステップ 2 */}
            <div className="flex flex-col items-center text-center space-y-4 relative z-10">
              <div className="num w-16 h-16 rounded-full bg-surface border-2 flex items-center justify-center font-bold text-xl border-money text-money">
                2
              </div>
              <h3 className="text-lg font-bold text-ink">AI が自動解析</h3>
              <p className="text-sm text-sub max-w-xs">
                ログインして「スキャン」ボタンから写真をアップロードすると、Gemini AI が1枚の画像から給油量・金額・区間走行距離などを自動的に抽出します。
              </p>
            </div>

            {/* ステップ 3 */}
            <div className="flex flex-col items-center text-center space-y-4 relative z-10">
              <div className="num w-16 h-16 rounded-full bg-surface border-2 flex items-center justify-center font-bold text-xl border-warn text-warn">
                3
              </div>
              <h3 className="text-lg font-bold text-ink">確認して保存、自動でグラフ化</h3>
              <p className="text-sm text-sub max-w-xs">
                区間走行距離 ÷ 給油量 で燃費を自動計算。読み取り結果を確認して保存すると、過去の履歴リストや推移チャートに即座に反映されます。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ（よくある質問）セクション */}
      <section id="faq" className="py-20 relative">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-12 space-y-4">
            <h2 className="text-xs font-bold tracking-widest text-accent uppercase">FAQ</h2>
            <p className="text-3xl font-bold text-ink">よくある質問</p>
          </div>

          <FaqAccordion items={faqs} />
        </div>
      </section>

      {/* 最後のCTAセクション */}
      <section className="py-16 md:py-24 relative overflow-hidden border-t border-line bg-surface/40">
        <div className="max-w-4xl mx-auto px-4 text-center relative z-10 space-y-8">
          <div className="space-y-3">
            <h2 className="text-3xl sm:text-4xl font-bold text-ink">あなたの車にも、AIのアイ（Lens）を。</h2>
            <p className="text-sm sm:text-base text-sub max-w-xl mx-auto">
              給油のたびに燃費がどれくらいか調べる楽しさを体験しましょう。
              数タップで始まる、新しいスマートな燃費管理を今すぐ無料でお試しください。
            </p>
          </div>

          <div>
            <Link
              href="/app"
              className="inline-flex items-center gap-2 bg-scan-gradient text-white font-bold text-lg px-10 py-5 rounded-2xl transition active:scale-95 hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-ground"
            >
              <span>今すぐ無料で使ってみる</span>
              <ChevronRight className="w-5 h-5" />
            </Link>
          </div>

          <div className="text-xs text-sub">
            手動入力は登録不要でお試し可能 • AI解析はログイン後に利用可 • スマートフォンでの撮影に対応
          </div>
        </div>
      </section>

      {/* フッター */}
      <footer className="border-t border-line bg-ground py-12 text-xs text-sub">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <BrandMark className="text-sm" />

          <p className="text-center md:text-left">
            © {new Date().getFullYear()} FuelLens. All rights reserved. Google Gemini AI OCR Powered.
          </p>

          <div className="flex items-center gap-2 sm:gap-6">
            <a href="#features" className="hover:text-ink transition px-2 py-3 sm:p-0">機能</a>
            <a href="#demo" className="hover:text-ink transition px-2 py-3 sm:p-0">デモ</a>
            <a href="#how-to" className="hover:text-ink transition px-2 py-3 sm:p-0">使い方</a>
            <a href="#faq" className="hover:text-ink transition px-2 py-3 sm:p-0">FAQ</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
