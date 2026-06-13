"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import { 
  Fuel, 
  Camera, 
  Sparkles, 
  Calculator, 
  BarChart3, 
  History, 
  ChevronRight, 
  Download, 
  Car, 
  ChevronDown, 
  CheckCircle2, 
  ArrowRight,
  ShieldAlert,
  Loader2,
  Calendar,
  MapPin,
  RefreshCw,
  ImageIcon,
  Plus
} from "lucide-react";

const faqs = [
  {
    q: "本当に無料で使えますか？",
    a: "はい、AI解析を含めたすべての基本機能を完全無料でご利用いただけます。広告や追加課金の心配なく、燃費管理を始めていただけます。"
  },
  {
    q: "ユーザー登録は必須ですか？",
    a: "いいえ、ユーザー登録なしでも「ローカル保存モード」としてすぐにご利用いただけます。スマートフォンのブラウザにデータが保存されます。データをクラウドへ保存し、機種変更時やパソコンなどの複数端末で共有したい場合にのみ、ログイン機能をご利用ください。"
  },
  {
    q: "レシートとメーターは別々に撮影する必要がありますか？",
    a: "いいえ、レシートとメーターが同時に写った写真1枚を撮影（またはアップロード）してください。AIが1枚の写真から、給油情報（給油量・金額・店舗名など）と、総走行距離（メーター）を同時に解析して抽出します。"
  },
  {
    q: "AIの文字認識精度はどのくらいですか？",
    a: "Googleの最新AI「Gemini」を活用しているため、夜間の暗いガソリンスタンドで撮影された写真や、多少斜めから撮られたレシートでも高い精度で数字を抽出します。万が一、数字の誤認識があった場合でも、ダッシュボード上で簡単に修正・編集できます。"
  },
  {
    q: "どのような車種に対応していますか？",
    a: "ガソリン車、ディーゼル車、ハイブリッド車など、オドメーター（総走行距離計）と給油量から燃費計算ができるすべての車両に対応しています。また、複数車両の登録機能により、マイカーと会社の車など複数台の管理も1つのアカウントで可能です。"
  }
];

export default function LandingPage() {
  // FAQの開閉状態管理
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // デモシミュレーターのステート
  const [demoState, setDemoState] = useState<"idle" | "scanning" | "result">("idle");
  const [selectedVehicle, setSelectedVehicle] = useState<"prius" | "aqua">("prius");

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  const demoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (demoTimerRef.current) clearTimeout(demoTimerRef.current);
    };
  }, []);

  const startDemoScan = () => {
    setDemoState("scanning");
    demoTimerRef.current = setTimeout(() => {
      setDemoState("result");
    }, 2000);
  };

  const resetDemo = () => {
    setDemoState("idle");
  };


  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 font-sans selection:bg-blue-600 selection:text-white relative overflow-hidden">
      
      {/* 背景の光る装飾グラデーション */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-blue-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-cyan-500/10 blur-[130px] pointer-events-none" />

      {/* ヘッダーナビゲーション */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-gray-950/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-gradient-to-tr from-blue-600 to-cyan-400 rounded-lg flex items-center justify-center shadow-md shadow-blue-500/10">
              <Fuel className="text-white w-5 h-5 fill-current" />
            </div>
            <span className="text-lg font-extrabold tracking-tight bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
              FuelLens
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-400">
            <a href="#features" className="hover:text-white transition">機能</a>
            <a href="#demo" className="hover:text-white transition">体験デモ</a>
            <a href="#how-to" className="hover:text-white transition">使い方</a>
            <a href="#faq" className="hover:text-white transition">よくある質問</a>
          </nav>

          <div className="flex items-center gap-3">
            <SignedOut>
              <SignInButton forceRedirectUrl="/app">
                <button className="text-sm font-semibold text-gray-300 hover:text-white transition px-4 py-2">
                  ログイン
                </button>
              </SignInButton>
              <Link href="/app" className="bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white text-xs sm:text-sm font-bold py-2 px-4 rounded-full transition shadow-lg shadow-blue-600/20 active:scale-95">
                今すぐ始める
              </Link>
            </SignedOut>
            <SignedIn>
              <Link href="/app" className="bg-gray-800 hover:bg-gray-700 text-white text-xs sm:text-sm font-semibold py-2 px-4 rounded-full border border-gray-700 transition flex items-center gap-1">
                <span>ダッシュボード</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </SignedIn>
          </div>
        </div>
      </header>

      {/* ヒーローセクション */}
      <section className="relative pt-20 pb-16 md:pt-32 md:pb-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            
            {/* 左側テキストコンテンツ */}
            <div className="lg:col-span-6 text-center lg:text-left space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-semibold text-blue-400 animate-fade-in">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Google Gemini AI が1枚の写真を自動解析</span>
              </div>
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold leading-tight text-white tracking-tight">
                車の給油をもっと<br />スマートに。<br />
                <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-500 bg-clip-text text-transparent">
                  写真1枚で<br />燃費を自動管理
                </span>
              </h1>
              <p className="text-base sm:text-lg text-gray-400 max-w-xl mx-auto lg:mx-0 leading-relaxed">
                給油時のレシートと車のメーターが同時に写った写真をスマホで1枚パシャリと撮るだけ。
                AIが自動的に給油量・金額・走行距離を読み取り、燃費を即時に計算・記録します。手入力のストレスから解放されましょう。
              </p>
              
              <div className="pt-4 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
                <Link href="/app" className="w-full sm:w-auto text-center bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-bold px-8 py-4 rounded-2xl shadow-xl shadow-blue-500/20 transition-all hover:scale-105 active:scale-95 text-lg">
                  無料で使ってみる
                </Link>
                <a href="#demo" className="w-full sm:w-auto text-center bg-gray-900 hover:bg-gray-800 text-gray-300 font-semibold px-6 py-4 rounded-2xl border border-gray-800 transition active:scale-95 text-base">
                  機能を体験する
                </a>
              </div>

              <div className="pt-6 flex items-center justify-center lg:justify-start gap-6 text-xs text-gray-500">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-green-500" /> アカウント登録不要でも利用可
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-green-500" /> 写真1枚のアップロードで完結
                </span>
              </div>
            </div>

            {/* 右側：アプリのコンポーネントを再現したリアルプレビューUI */}
            <div className="lg:col-span-6 relative flex justify-center">
              <div className="w-full max-w-[370px] bg-gray-950 border border-gray-800 rounded-[44px] p-3 shadow-2xl relative ring-8 ring-gray-950/80 overflow-hidden">
                {/* スピーカーとインカメラのノッチ */}
                <div className="absolute top-3 left-1/2 -translate-x-1/2 w-32 h-4 bg-black rounded-full z-20 flex items-center justify-center">
                  <div className="w-2.5 h-2.5 rounded-full bg-gray-800 ml-auto mr-4" />
                </div>
                
                {/* アプリ画面の実コンポーネント再現UI */}
                <div className="w-full h-full bg-gradient-to-b from-gray-900 to-black rounded-[36px] p-4 pt-8 flex flex-col justify-between text-xs overflow-hidden select-none font-sans text-white">
                  
                  {/* アプリヘッダーコンポーネント */}
                  <div className="flex justify-between items-center py-2 mb-2 border-b border-white/5">
                    <div className="flex items-center gap-1.5">
                      <div className="w-6 h-6 bg-gradient-to-tr from-blue-600 to-cyan-400 rounded-md flex items-center justify-center shadow-inner">
                        <Fuel className="text-white w-3.5 h-3.5 fill-current" />
                      </div>
                      <span className="font-extrabold text-sm tracking-tight text-white">FuelLens</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-gray-800/50 rounded-full border border-gray-700/50 text-gray-400">
                        <BarChart3 className="w-3.5 h-3.5" />
                      </div>
                      <div className="p-1.5 bg-gray-800/50 rounded-full border border-gray-700/50 text-gray-400">
                        <History className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </div>

                  {/* 車両セレクターコンポーネント (VehicleSelector.tsx) の再現 */}
                  <div className="w-full mb-4">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 p-1 bg-gray-950/40 border border-gray-800/80 rounded-xl w-full">
                        <button
                          onClick={() => setSelectedVehicle("prius")}
                          className={`flex items-center gap-1 py-1 px-3 rounded-lg font-bold text-[10px] transition-all duration-300 flex-1 justify-center ${
                            selectedVehicle === "prius"
                              ? "bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-md shadow-blue-950" 
                              : "text-gray-400 hover:text-white"
                          }`}
                        >
                          <Car className="w-3 h-3 flex-shrink-0" />
                          <span>プリウス</span>
                        </button>
                        <button
                          onClick={() => setSelectedVehicle("aqua")}
                          className={`flex items-center gap-1 py-1 px-3 rounded-lg font-bold text-[10px] transition-all duration-300 flex-1 justify-center ${
                            selectedVehicle === "aqua"
                              ? "bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-md shadow-blue-950" 
                              : "text-gray-400 hover:text-white"
                          }`}
                        >
                          <Car className="w-3 h-3 flex-shrink-0" />
                          <span>アクア</span>
                        </button>
                        <button className="flex items-center justify-center p-1 rounded-lg text-gray-500 border border-dashed border-gray-800">
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 2カラムレイアウト（縦積み） */}
                  <div className="space-y-4">
                    
                    {/* アクションエリア (app/app/page.tsx のスキャンカード) */}
                    <div className="relative overflow-hidden bg-gray-800/40 backdrop-blur-xl border border-gray-700/50 rounded-2xl shadow-xl">
                      <div className="p-4 flex flex-col items-center gap-3">
                        <div className="text-center space-y-0.5">
                          <h2 className="text-sm font-semibold text-white">スキャンして記録</h2>
                          <p className="text-[10px] text-blue-400 font-semibold">
                            対象: {selectedVehicle === "prius" ? "プリウス" : "アクア"}
                          </p>
                          <p className="text-[10px] text-gray-400">レシートとメーターを1枚に収めて撮影</p>
                        </div>

                        <div className="w-16 h-16 rounded-full bg-gradient-to-b from-blue-500 to-blue-700 shadow-md flex items-center justify-center border-4 border-blue-400/30">
                          <Camera className="w-7 h-7 text-white fill-blue-500" />
                        </div>

                        <div className="flex items-center gap-1 text-[10px] text-gray-500">
                          <ImageIcon className="w-3.5 h-3.5" />
                          <span>アルバムから選択</span>
                        </div>
                      </div>
                    </div>

                    {/* 最新リザルトカード (app/app/page.tsx のLatest Recordカード) */}
                    <div>
                      <div className="flex items-center justify-between px-1 mb-1">
                        <h3 className="text-[9px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                          <Calculator className="w-3 h-3" /> Latest Record
                        </h3>
                      </div>

                      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-gray-800 to-gray-900 border-gray-700 p-4">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <p className="text-[9px] text-gray-500 mb-0.5 flex items-center gap-1">
                              <Calendar className="w-2.5 h-2.5" /> 2026-05-21
                            </p>
                            <div className="flex items-baseline gap-0.5">
                              <span className="text-2xl font-bold text-white font-mono tracking-tighter">
                                {selectedVehicle === "prius" ? "22.45" : "19.80"}
                              </span>
                              <span className="text-[10px] font-bold text-blue-500">km/L</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold text-green-400 font-mono">
                              {selectedVehicle === "prius" ? "¥5,480" : "¥4,120"}
                            </p>
                            <p className="text-[9px] text-gray-500">Total Cost</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 bg-black/20 rounded-lg p-2.5 border border-white/5 text-[10px]">
                          <div>
                            <p className="text-[8px] text-gray-400 uppercase">給油量</p>
                            <p className="font-mono font-bold text-blue-200">
                              {selectedVehicle === "prius" ? "35.40 L" : "28.50 L"}
                            </p>
                          </div>
                          <div>
                            <p className="text-[8px] text-gray-400 uppercase">走行距離</p>
                            <p className="font-mono font-bold text-gray-200">
                              {selectedVehicle === "prius" ? "795 km" : "564 km"}
                            </p>
                          </div>
                          <div className="col-span-2 flex items-center gap-1.5 pt-1.5 border-t border-white/5 text-[9px]">
                            <MapPin className="w-3 h-3 text-gray-500" />
                            <p className="text-gray-400 truncate">ENEOS 新宿SS</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 履歴へのリンクボタン (app/app/page.tsx の下部リンク) */}
                    <div className="group flex items-center justify-between w-full p-3 rounded-xl bg-gray-900 border border-gray-800 text-[10px]">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-gray-800 rounded-lg">
                          <History className="w-4 h-4 text-gray-400" />
                        </div>
                        <div className="text-left">
                          <p className="font-bold text-gray-200">過去の記録を見る</p>
                          <p className="text-[9px] text-gray-500">
                            対象: {selectedVehicle === "prius" ? "プリウス" : "アクア"}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-500" />
                    </div>

                  </div>

                </div>
              </div>

              {/* フローティングデコレーション */}
              <div className="absolute top-1/4 -left-6 bg-gray-900/90 backdrop-blur-xl border border-gray-700 p-3.5 rounded-2xl shadow-xl flex items-center gap-3 animate-bounce duration-1000 max-w-[170px]">
                <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center text-green-400">
                  <Calculator className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[10px] text-gray-500">給油単価</p>
                  <p className="text-xs font-bold text-white">¥155/L</p>
                </div>
              </div>

              <div className="absolute bottom-1/4 -right-8 bg-gray-900/90 backdrop-blur-xl border border-gray-700 p-3.5 rounded-2xl shadow-xl flex items-center gap-3 max-w-[170px]">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[10px] text-gray-500">AI OCR解析</p>
                  <p className="text-xs font-bold text-white">1枚の画像から自動抽出</p>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* 特徴・機能紹介セクション */}
      <section id="features" className="py-20 bg-gray-900/30 border-y border-white/5 relative">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-2xl mx-auto mb-16 space-y-4">
            <h2 className="text-xs font-bold tracking-widest text-blue-500 uppercase">FEATURES</h2>
            <p className="text-3xl sm:text-4xl font-bold text-white">燃費管理に必要な、すべての機能</p>
            <p className="text-sm sm:text-base text-gray-400">
              面倒な手計算やメモ書きはもう必要ありません。スマートな車生活をサポートする機能を取り揃えました。
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            
            {/* 特徴カード 1 */}
            <div className="bg-gray-900/40 border border-white/5 rounded-3xl p-6 hover:border-blue-500/30 transition-all hover:translate-y-[-4px] duration-300">
              <div className="w-12 h-12 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mb-6">
                <Sparkles className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">1枚の写真からAI自動読取</h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                領収書の給油データとメーターの総走行距離が同時に映った写真を撮影するだけ。Gemini AIがすべての数値を同時に抽出します。
              </p>
            </div>

            {/* 特徴カード 2 */}
            <div className="bg-gray-900/40 border border-white/5 rounded-3xl p-6 hover:border-blue-500/30 transition-all hover:translate-y-[-4px] duration-300">
              <div className="w-12 h-12 rounded-2xl bg-cyan-600/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-6">
                <Calculator className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">燃費の自動計算</h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                前回と今回のメーター走行距離の差分と、今回の給油量から実燃費を算出。ガソリン単価や次の給油目安もリアルタイムに表示します。
              </p>
            </div>

            {/* 特徴カード 3 */}
            <div className="bg-gray-900/40 border border-white/5 rounded-3xl p-6 hover:border-blue-500/30 transition-all hover:translate-y-[-4px] duration-300">
              <div className="w-12 h-12 rounded-2xl bg-purple-600/10 border border-purple-500/20 flex items-center justify-center text-purple-400 mb-6">
                <BarChart3 className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">グラフで支出と燃費の推移を可視化</h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                季節ごとの燃費の変化や、ガソリン価格の高騰状況、月ごとの給油総額を綺麗なチャートで可視化。愛車のコンディション管理にも役立ちます。
              </p>
            </div>

            {/* 特徴カード 4 */}
            <div className="bg-gray-900/40 border border-white/5 rounded-3xl p-6 hover:border-blue-500/30 transition-all hover:translate-y-[-4px] duration-300">
              <div className="w-12 h-12 rounded-2xl bg-emerald-600/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-6">
                <Car className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">複数車両の登録・個別管理</h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                マイカー、セカンドカー、仕事用のバンなど、複数の車両を登録して、個別に燃費データや給油履歴を切り替え管理することができます。
              </p>
            </div>

            {/* 特徴カード 5 */}
            <div className="bg-gray-900/40 border border-white/5 rounded-3xl p-6 hover:border-blue-500/30 transition-all hover:translate-y-[-4px] duration-300">
              <div className="w-12 h-12 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-6">
                <Download className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">CSVデータエクスポート</h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                これまでに記録した全データをワンクリックでCSV形式で出力可能。Excelで自由にグラフを編集したり、家計簿ソフトに取り込んだりできます。
              </p>
            </div>

            {/* 特徴カード 6 */}
            <div className="bg-gray-900/40 border border-white/5 rounded-3xl p-6 hover:border-blue-500/30 transition-all hover:translate-y-[-4px] duration-300">
              <div className="w-12 h-12 rounded-2xl bg-amber-600/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-6">
                <History className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">クラウド同期 & ローカル体験</h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                未ログイン状態でもローカルに保存されます。Clerkアカウントでログインすれば、Supabaseにデータを安全に保存し、PCやタブレットでも同期できます。
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* 体験デモ（スキャンシミュレーター）セクション */}
      <section id="demo" className="py-20 relative">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-12 space-y-4">
            <h2 className="text-xs font-bold tracking-widest text-blue-500 uppercase">INTERACTIVE DEMO</h2>
            <p className="text-3xl font-bold text-white">AIの読み取りを10秒で体験</p>
            <p className="text-sm text-gray-400">
              以下のシミュレーターで「デモ写真を解析」ボタンをクリックして、どのようにAIが写真を認識し燃費を算出するのかを体験してみてください。
            </p>
          </div>

          <div className="bg-gray-900/60 border border-gray-800 rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden backdrop-blur-xl">
            
            {demoState === "idle" && (
              <div className="space-y-8 py-6 flex flex-col items-center">
                <div className="flex items-center justify-center w-full max-w-xl">
                  {/* メーターとレシートが1枚に収まったダミーの写真イメージ */}
                  <div className="w-full bg-gray-900/50 border border-gray-800 rounded-2xl pt-16 pb-6 px-6 flex flex-col sm:flex-row items-center gap-8 shadow-xl relative overflow-hidden">
                    <div className="absolute inset-0 bg-blue-500/5 pointer-events-none" />
                    
                    {/* レシート部分 */}
                    <div className="w-44 bg-white text-black p-4 rounded shadow font-mono text-xs border border-gray-200 scale-95 flex-shrink-0">
                      <div className="text-center border-b border-dashed border-gray-300 pb-2">
                        <p className="font-sans font-bold text-sm leading-tight">ENEOS 新宿南口SS</p>
                        <p className="font-sans text-[10px] text-gray-500">2026-05-21 18:45</p>
                      </div>
                      <div className="py-2.5 space-y-1.5">
                        <div className="flex justify-between">
                          <span>レギュラー</span>
                          <span>35.48 L</span>
                        </div>
                        <div className="flex justify-between font-bold text-sm pt-1.5 border-t border-gray-200">
                          <span>合計金額</span>
                          <span>¥5,500</span>
                        </div>
                      </div>
                    </div>

                    {/* メーター部分 (トリップメーターに変更) */}
                    <div className="flex-1 w-full bg-gray-950 border-2 border-gray-800 p-4 rounded-xl shadow-inner text-center flex flex-col justify-center">
                      <div className="w-full h-14 bg-black border border-gray-800 rounded flex items-center justify-center font-mono text-3xl text-amber-500 tracking-widest relative px-4">
                        <span className="absolute left-2.5 text-xs text-gray-500 uppercase font-sans font-bold">Trip</span>
                        0548.0<span className="text-xs text-gray-500 self-end mb-0.5 ml-1">km</span>
                      </div>
                    </div>

                    {/* カメラファインダー風の装飾線 */}
                    <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-blue-500" />
                    <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-blue-500" />
                    <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-blue-500" />
                    <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-blue-500" />
                    
                    <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5 whitespace-nowrap">
                      <Camera className="w-3.5 h-3.5" />
                      <span>レシート＆メーター同時撮影写真 (1枚)</span>
                    </div>
                  </div>
                </div>

                <button 
                  onClick={startDemoScan}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-8 py-4 rounded-full transition shadow-lg shadow-blue-500/20 active:scale-95 flex items-center gap-2 text-base"
                >
                  <Sparkles className="w-5 h-5" />
                  <span>デモ写真を解析する（シミュレート）</span>
                </button>
              </div>
            )}

            {demoState === "scanning" && (
              <div className="py-20 flex flex-col items-center justify-center space-y-6">
                <div className="relative">
                  <Loader2 className="w-16 h-16 text-blue-500 animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Camera className="w-6 h-6 text-blue-400" />
                  </div>
                </div>
                
                <div className="text-center space-y-2">
                  <p className="text-xl font-bold text-white animate-pulse">
                    AIが1枚の写真からレシートとメーターを同時にスキャン中...
                  </p>
                  <p className="text-sm text-gray-500">Gemini AI モデルが画像解析を実行しています</p>
                </div>
              </div>
            )}

            {demoState === "result" && (
              <div className="space-y-6 py-2 animate-in fade-in zoom-in-95 duration-500">
                <div className="flex items-center justify-between border-b border-white/5 pb-4">
                  <h3 className="text-lg font-bold text-green-400 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5" /> AI解析完了（以下のようにダッシュボードに反映されます）
                  </h3>
                  <button 
                    onClick={resetDemo}
                    className="text-sm text-gray-400 hover:text-white flex items-center gap-1.5 px-3 py-2 rounded-lg hover:bg-gray-800 transition"
                  >
                    <RefreshCw className="w-4 h-4" /> もう一度試す
                  </button>
                </div>

                {/* 実アプリ (/app) のリザルトカードの構成・クラスを完全再現し、文字サイズを拡大 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                  
                  {/* アプリの最新リザルトカードの再現 */}
                  <div className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-gray-800 to-gray-900 border-gray-700 p-6 shadow-md">
                    <div className="flex justify-between items-start mb-6">
                      <div>
                        <p className="text-xs text-gray-500 mb-1 flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" /> 2026-05-21
                        </p>
                        <div className="flex items-baseline gap-1">
                          <span className="text-4xl font-bold text-white font-mono tracking-tighter">
                            15.45
                          </span>
                          <span className="text-sm font-bold text-blue-500">km/L</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-3xl font-extrabold text-green-400 font-mono">
                          ¥5,500
                        </p>
                        <p className="text-xs text-gray-500">Total Cost</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 bg-black/20 rounded-xl p-4 border border-white/5 text-sm">
                      <div>
                        <p className="text-xs text-gray-400 uppercase">給油量</p>
                        <p className="text-xl font-mono font-bold text-blue-200">35.48 <span className="text-xs text-gray-500">L</span></p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 uppercase">区間走行距離</p>
                        <p className="text-xl font-mono font-bold text-gray-200">548.0 <span className="text-xs text-gray-500">km</span></p>
                      </div>
                      <div className="col-span-2 flex items-center gap-2 pt-2.5 border-t border-white/5 text-xs">
                         <MapPin className="w-4 h-4 text-gray-500" />
                        <p className="text-gray-400 truncate">ENEOS 新宿南口SS</p>
                      </div>
                    </div>
                  </div>

                  {/* 認識詳細 - 文字サイズを拡大 */}
                  <div className="space-y-4">
                    <h4 className="text-base font-bold text-gray-300">AIによる読取項目</h4>
                    <ul className="space-y-3 text-sm sm:text-base text-gray-400">
                      <li className="flex items-center gap-3 bg-gray-900/50 p-3 rounded-lg border border-white/5">
                        <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                        <span>トリップメーター (区間走行距離): <strong className="text-white font-mono text-base">548.0 km</strong> を認識</span>
                      </li>
                      <li className="flex items-center gap-3 bg-gray-900/50 p-3 rounded-lg border border-white/5">
                        <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                        <span>給油量: <strong className="text-white font-mono text-base">35.48 L</strong> を認識</span>
                      </li>
                      <li className="flex items-center gap-3 bg-gray-900/50 p-3 rounded-lg border border-white/5">
                        <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                        <span>支払金額: <strong className="text-white font-mono text-base">¥5,500</strong> を認識</span>
                      </li>
                      <li className="flex items-center gap-3 bg-gray-900/50 p-3 rounded-lg border border-white/5">
                        <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                        <span>給油日: <strong className="text-white font-mono text-base">2026-05-21</strong> を認識</span>
                      </li>
                      <li className="flex items-center gap-3 bg-gray-900/50 p-3 rounded-lg border border-white/5">
                        <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                        <span>店舗名: <strong className="text-white font-sans text-sm">ENEOS 新宿南口SS</strong> を認識</span>
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="bg-blue-500/5 border border-blue-500/10 rounded-2xl p-4 flex gap-3 items-start text-sm text-blue-300 leading-normal">
                  <ShieldAlert className="w-6 h-6 flex-shrink-0 text-blue-400" />
                  <p>
                    実際のアプリ画面では、このスキャン結果がそのまま履歴データベースに即座に同期され、推移グラフに自動追加されます。
                  </p>
                </div>
              </div>
            )}

          </div>
        </div>
      </section>

      {/* 使い方（ステップ）セクション */}
      <section id="how-to" className="py-20 bg-gray-900/30 border-y border-white/5">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-2xl mx-auto mb-16 space-y-4">
            <h2 className="text-xs font-bold tracking-widest text-blue-500 uppercase">HOW IT WORKS</h2>
            <p className="text-3xl sm:text-4xl font-bold text-white">たった3ステップの簡単管理</p>
            <p className="text-sm text-gray-400">
              給油時にサッとスマホを取り出すだけ。1回10秒の簡単なオペレーションです。
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 relative">
            {/* バックグラウンドライン（デスクトップ用） */}
            <div className="hidden lg:block absolute top-[50px] left-[15%] right-[15%] h-[2px] bg-gradient-to-r from-blue-500/20 via-cyan-500/20 to-transparent z-0" />

            {/* ステップ 1 */}
            <div className="flex flex-col items-center text-center space-y-4 relative z-10">
              <div className="w-16 h-16 rounded-full bg-gray-900 border-2 border-blue-500 flex items-center justify-center font-bold text-xl text-blue-400 shadow-lg shadow-blue-500/10">
                1
              </div>
              <h3 className="text-lg font-bold text-white">レシートとメーターを同時に撮影</h3>
              <p className="text-sm text-gray-400 max-w-xs">
                給油レシートと、車のメーター画面（総走行距離）が同時に写った写真をスマートフォンカメラで1枚撮影します。
              </p>
            </div>

            {/* ステップ 2 */}
            <div className="flex flex-col items-center text-center space-y-4 relative z-10">
              <div className="w-16 h-16 rounded-full bg-gray-900 border-2 border-cyan-500 flex items-center justify-center font-bold text-xl text-cyan-400 shadow-lg shadow-cyan-500/10">
                2
              </div>
              <h3 className="text-lg font-bold text-white">AI が自動解析</h3>
              <p className="text-sm text-gray-400 max-w-xs">
                「スキャン」ボタンを押してアップロードすると、Gemini AI が1枚の画像からすべての情報を自動的に抽出します。
              </p>
            </div>

            {/* ステップ 3 */}
            <div className="flex flex-col items-center text-center space-y-4 relative z-10">
              <div className="w-16 h-16 rounded-full bg-gray-900 border-2 border-purple-500 flex items-center justify-center font-bold text-xl text-purple-400 shadow-lg shadow-purple-500/10">
                3
              </div>
              <h3 className="text-lg font-bold text-white">自動でグラフ化・履歴保存</h3>
              <p className="text-sm text-gray-400 max-w-xs">
                前回の走行距離と比較して燃費を自動計算。データは自動保存され、過去の履歴リストや推移チャートに即座に反映されます。
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* FAQ（よくある質問）セクション */}
      <section id="faq" className="py-20 relative">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          
          <div className="text-center max-w-2xl mx-auto mb-12 space-y-4">
            <h2 className="text-xs font-bold tracking-widest text-blue-500 uppercase">FAQ</h2>
            <p className="text-3xl font-bold text-white">よくある質問</p>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, idx) => (
              <div 
                key={idx} 
                className="bg-gray-900/50 border border-gray-800 rounded-2xl overflow-hidden transition-all duration-300"
              >
                <button
                  onClick={() => toggleFaq(idx)}
                  className="w-full px-6 py-5 flex items-center justify-between text-left font-bold text-white hover:bg-gray-800/40 transition"
                >
                  <span className="text-sm sm:text-base">{faq.q}</span>
                  <ChevronDown 
                    className={`w-5 h-5 text-gray-500 transition-transform duration-300 ${openFaq === idx ? "rotate-180 text-blue-400" : ""}`} 
                  />
                </button>
                
                <div 
                  className={`transition-all duration-300 ease-in-out overflow-hidden ${openFaq === idx ? "max-h-[200px] border-t border-white/5 opacity-100" : "max-h-0 opacity-0 pointer-events-none"}`}
                >
                  <div className="px-6 py-5 text-xs sm:text-sm text-gray-400 leading-relaxed bg-black/10">
                    {faq.a}
                  </div>
                </div>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* 最後のCTAセクション */}
      <section className="py-16 md:py-24 relative overflow-hidden bg-gradient-to-b from-gray-950 via-gray-900 to-black">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-blue-600/10 blur-[100px] pointer-events-none" />
        <div className="max-w-4xl mx-auto px-4 text-center relative z-10 space-y-8">
          <div className="space-y-3">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white">あなたの車にも、AIのアイ（Lens）を。</h2>
            <p className="text-sm sm:text-base text-gray-400 max-w-xl mx-auto">
              給油のたびに燃費がどれくらいか調べる楽しさを体験しましょう。
              数タップで始まる、新しいスマートな燃費管理を今すぐ無料でお試しください。
            </p>
          </div>

          <div>
            <Link href="/app" className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-extrabold text-lg px-10 py-5 rounded-2xl shadow-xl shadow-blue-500/20 hover:scale-105 active:scale-95 transition-all">
              <span>今すぐ無料で使ってみる</span>
              <ChevronRight className="w-5 h-5" />
            </Link>
          </div>

          <div className="text-xs text-gray-500">
            登録不要でお試し可能 • スマートフォンでの撮影に対応
          </div>
        </div>
      </section>

      {/* フッター */}
      <footer className="border-t border-white/5 bg-black py-12 text-xs text-gray-600">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-gray-800 rounded-lg flex items-center justify-center text-gray-400">
              <Fuel className="w-4 h-4 fill-current" />
            </div>
            <span className="text-sm font-bold text-gray-400">FuelLens</span>
          </div>

          <p className="text-center md:text-left">
            © {new Date().getFullYear()} FuelLens. All rights reserved. Google Gemini AI OCR Powered.
          </p>

          <div className="flex items-center gap-6">
            <a href="#features" className="hover:text-gray-400 transition">機能</a>
            <a href="#demo" className="hover:text-gray-400 transition">デモ</a>
            <a href="#how-to" className="hover:text-gray-400 transition">使い方</a>
            <a href="#faq" className="hover:text-gray-400 transition">FAQ</a>
          </div>
        </div>
      </footer>

    </div>
  );
}