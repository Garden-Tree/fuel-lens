// src/app/page.tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Webcam from "react-webcam"; // ★カメラ埋め込み用
import { Camera, History, Loader2, Bug, ChevronDown, ChevronUp, Fuel, Timer, Image as ImageIcon, X } from "lucide-react";
import imageCompression from "browser-image-compression";

// 型定義
type FuelRecord = {
  id: string;
  date: string;
  total_distance: number | null;
  fuel_amount: number | null;
  gas_station: string | null;
  price_per_unit: number | null;
  total_cost: number | null;
  fuel_efficiency: number | null;
};

// カメラの設定（スマホの背面カメラを指定）
const videoConstraints = {
  width: 1280,
  height: 720,
  facingMode: "environment" // 背面カメラ
};

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [records, setRecords] = useState<FuelRecord[]>([]);
  const [preview, setPreview] = useState<string | null>(null); // 撮影後の静止画
  const [isCameraActive, setIsCameraActive] = useState(true); // カメラ表示モードかどうか
  const [debugData, setDebugData] = useState<any>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  
  const webcamRef = useRef<Webcam>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("fuel_lens_data");
    if (saved) setRecords(JSON.parse(saved));
  }, []);

  // ★シャッターボタンを押した時の処理
  const capture = useCallback(async () => {
    if (!webcamRef.current) return;
    
    // カメラの映像を画像(Base64)として取得
    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) return;

    setPreview(imageSrc); // プレビュー表示
    setIsCameraActive(false); // カメラ停止
    analyzeImage(imageSrc); // 解析へ

  }, [webcamRef]);

  // アルバムから選択した場合
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // アルバムの場合は圧縮をかける
    const options = { maxSizeMB: 0.8, maxWidthOrHeight: 1200, useWebWorker: true };
    setLoading(true);
    setLoadingMessage("画像を処理中...");
    
    try {
      const compressedFile = await imageCompression(file, options);
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target?.result as string;
        setPreview(base64);
        setIsCameraActive(false);
        analyzeImage(base64);
      };
      reader.readAsDataURL(compressedFile);
    } catch (error) {
      setLoading(false);
    }
  };

  const analyzeImage = async (base64: string) => {
    setLoading(true);
    setLoadingMessage("AIが解析しています...");
    setDebugData(null);

    try {
      console.time("API通信時間");
      const res = await fetch("/api/analyze", {
        method: "POST",
        body: JSON.stringify({ imageBase64: base64 }),
      });
      console.timeEnd("API通信時間");

      const data = await res.json();
      setDebugData(data);

      if (data.error) {
        alert("APIエラー: " + data.error);
        setLoading(false);
        return; // エラー時はプレビュー維持
      }

      let calcEfficiency = null;
      if (data.total_distance && data.fuel_amount && data.fuel_amount > 0) {
        calcEfficiency = parseFloat((data.total_distance / data.fuel_amount).toFixed(2));
      }

      const newRecord: FuelRecord = {
        id: Date.now().toString(),
        ...data,
        fuel_efficiency: calcEfficiency,
      };

      const updatedRecords = [newRecord, ...records];
      setRecords(updatedRecords);
      localStorage.setItem("fuel_lens_data", JSON.stringify(updatedRecords));
      setExpandedId(newRecord.id);
      
      // 成功したら完了状態へ（プレビューはそのまま残すか、カメラに戻すかは好み）
      setLoading(false);

    } catch (err) {
      alert("通信エラー");
      setLoading(false);
    }
  };

  // 撮影し直す（カメラに戻る）
  const retake = () => {
    setPreview(null);
    setIsCameraActive(true);
    setDebugData(null);
    setLoading(false);
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <main className="min-h-screen bg-gray-950 text-white max-w-md mx-auto relative pb-20">
      
      {/* ★カメラ/プレビューエリア（画面上部に固定） */}
      <div className="relative w-full h-[60vh] bg-black overflow-hidden rounded-b-3xl shadow-2xl z-10">
        
        {/* ローディング表示 */}
        {loading && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
            <Loader2 className="w-12 h-12 animate-spin text-blue-500 mb-4" />
            <p className="text-lg font-bold animate-pulse">{loadingMessage}</p>
          </div>
        )}

        {isCameraActive ? (
          // ライブカメラ映像
          <Webcam
            audio={false}
            ref={webcamRef}
            screenshotFormat="image/jpeg"
            videoConstraints={videoConstraints}
            className="w-full h-full object-cover"
            mirrored={false} // 背面カメラなので鏡像反転しない
          />
        ) : (
          // 撮影後の静止画プレビュー
          <div className="relative w-full h-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview!} alt="Preview" className="w-full h-full object-cover" />
            
            {/* 再撮影ボタン（左上） */}
            {!loading && (
              <button onClick={retake} className="absolute top-4 left-4 bg-black/50 p-2 rounded-full backdrop-blur-md">
                <X className="w-6 h-6 text-white" />
              </button>
            )}
          </div>
        )}

        {/* シャッターボタンなど（カメラ起動時のみ表示） */}
        {isCameraActive && !loading && (
          <div className="absolute bottom-8 left-0 right-0 flex justify-center items-center gap-8">
            
            {/* アルバム選択ボタン */}
            <button 
              onClick={() => galleryInputRef.current?.click()}
              className="p-3 bg-gray-800/80 rounded-full backdrop-blur hover:bg-gray-700/80 transition"
            >
              <ImageIcon className="w-6 h-6 text-white" />
            </button>

            {/* ★シャッターボタン（ここを押すだけ！） */}
            <button
              onClick={capture}
              className="w-20 h-20 bg-white rounded-full border-4 border-gray-300 shadow-lg active:scale-95 transition-transform flex items-center justify-center"
            >
              <div className="w-16 h-16 bg-white rounded-full border-2 border-black/10" />
            </button>

            {/* ダミー（レイアウト調整用） */}
            <div className="w-12" />
          </div>
        )}
      </div>

      {/* コンテンツエリア（ヘッダーと履歴） */}
      <div className="p-4 pt-6">
        <header className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <span className="bg-blue-600 p-1 rounded-lg text-sm">⛽️</span> FuelLens
          </h1>
          <div className="flex gap-2">
             <button className="p-2 bg-gray-900 rounded-full border border-gray-800">
               <History className="w-5 h-5 text-gray-400" />
             </button>
          </div>
        </header>

        {/* 隠しinput（アルバム用） */}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          ref={galleryInputRef}
          onChange={handleFileChange}
        />

        {/* デバッグ表示 */}
        {debugData && (
            <div className="mb-6 bg-black p-3 rounded-lg border border-green-900/50 font-mono text-[10px] text-left overflow-hidden">
            <div className="flex items-center gap-2 mb-1 text-green-500 font-bold">
                <Bug className="w-3 h-3" /> Result
            </div>
            <div className="truncate text-green-400">
                {JSON.stringify(debugData)}
            </div>
            </div>
        )}

        {/* 履歴リスト */}
        <h2 className="text-sm font-semibold mb-3 text-gray-400 uppercase tracking-wider">History</h2>
        <div className="space-y-3 pb-10">
          {records.map((rec) => (
            <div 
              key={rec.id} 
              onClick={() => toggleExpand(rec.id)}
              className={`bg-gray-900 rounded-xl border border-gray-800 overflow-hidden transition-all duration-200 cursor-pointer ${expandedId === rec.id ? 'ring-1 ring-blue-500 border-blue-500' : ''}`}
            >
              <div className="p-4 flex justify-between items-center">
                <div>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-xl font-bold text-white font-mono">
                      {rec.fuel_efficiency ? rec.fuel_efficiency.toFixed(2) : "--.--"}
                    </span>
                    <span className="text-xs text-blue-400 font-bold">km/L</span>
                  </div>
                  <p className="text-xs text-gray-500">{rec.date} • {rec.gas_station || "SS不明"}</p>
                </div>
                <div className="text-right">
                   <p className="font-mono text-white text-sm">{rec.total_distance}km</p>
                   <p className="font-mono text-gray-500 text-xs">{rec.fuel_amount}L</p>
                </div>
              </div>
              
              {expandedId === rec.id && (
                <div className="px-4 pb-4 pt-0 border-t border-gray-800 bg-gray-900/50">
                    <div className="flex justify-between mt-3 text-xs">
                        <span className="text-gray-500">支払総額</span>
                        <span className="text-green-400 font-mono text-sm">¥{rec.total_cost?.toLocaleString()}</span>
                    </div>
                </div>
              )}
            </div>
          ))}
          {records.length === 0 && <p className="text-center text-gray-700 text-sm py-4">履歴がありません</p>}
        </div>
      </div>
    </main>
  );
}