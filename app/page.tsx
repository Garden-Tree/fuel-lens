"use client";

import { useState, useEffect, useRef } from "react";
import { 
  Camera, 
  History, 
  Loader2, 
  Fuel, 
  Image as ImageIcon, 
  MapPin,
  Calendar,
  Edit2, 
  Save,  
  X,     
  Calculator,
  Lock
} from "lucide-react";
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

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<"compress" | "analyze" | null>(null);
  const [records, setRecords] = useState<FuelRecord[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  
  // 編集モード管理
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<FuelRecord | null>(null);
  
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("fuel_lens_data");
    if (saved) setRecords(JSON.parse(saved));
  }, []);

  // 画像処理
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const options = {
      maxSizeMB: 0.8,
      maxWidthOrHeight: 1200,
      useWebWorker: true,
    };

    setLoading(true);
    setLoadingStep("compress");

    try {
      const compressedFile = await imageCompression(file, options);
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target?.result as string;
        setPreview(base64); // ★ここでセットした画像を表示し続ける
        analyzeImage(base64);
      };
      reader.readAsDataURL(compressedFile);
    } catch (error) {
      setLoading(false);
      alert("画像の処理に失敗しました");
    }
  };

  // AI解析
  const analyzeImage = async (base64: string) => {
    setLoadingStep("analyze");

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        body: JSON.stringify({ imageBase64: base64 }),
      });
      const data = await res.json();

      if (data.error) throw new Error(data.error);

      // 燃費計算
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
      
      // ★修正: 解析が終わってもプレビューを消さない
      // setPreview(null); 

    } catch (err) {
      alert("解析に失敗しました。");
      console.error(err);
    } finally {
      setLoading(false);
      setLoadingStep(null);
    }
  };

  // プレビューを閉じる
  const clearPreview = () => {
    setPreview(null);
  };

  // 編集開始
  const startEditing = (record: FuelRecord) => {
    setEditForm({ ...record });
    setIsEditing(true);
  };

  // 編集キャンセル
  const cancelEditing = () => {
    setIsEditing(false);
    setEditForm(null);
  };

  // 編集保存
  const saveEditing = () => {
    if (!editForm) return;

    let newEfficiency = editForm.fuel_efficiency;
    if (editForm.total_distance && editForm.fuel_amount && editForm.fuel_amount > 0) {
      newEfficiency = parseFloat((editForm.total_distance / editForm.fuel_amount).toFixed(2));
    }

    const updatedRecord = { ...editForm, fuel_efficiency: newEfficiency };
    const updatedRecords = records.map((rec) => 
      rec.id === updatedRecord.id ? updatedRecord : rec
    );

    setRecords(updatedRecords);
    localStorage.setItem("fuel_lens_data", JSON.stringify(updatedRecords));
    
    setIsEditing(false);
    setEditForm(null);
  };

  // フォーム入力ハンドラ
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>, field: keyof FuelRecord) => {
    if (!editForm) return;
    const val = e.target.value;
    
    let newForm = { ...editForm };
    const numFields = ["total_distance", "fuel_amount", "price_per_unit", "total_cost"];
    
    if (numFields.includes(field)) {
      (newForm as any)[field] = val === "" ? null : parseFloat(val);
    } else {
      (newForm as any)[field] = val;
    }

    if (field === "fuel_amount" || field === "total_cost") {
      const amount = (newForm as any).fuel_amount;
      const cost = (newForm as any).total_cost;
      if (amount && cost && amount > 0) {
        (newForm as any).price_per_unit = Math.round(cost / amount);
      }
    }
    setEditForm(newForm);
  };

  const latestRecord = records[0];
  const pastRecords = records.slice(1);

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white p-4 pb-32 max-w-md mx-auto font-sans">
      
      {/* ヘッダー */}
      <header className="flex items-center justify-between py-4 mb-6">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-gradient-to-tr from-blue-600 to-cyan-400 rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/20">
            <Fuel className="text-white w-6 h-6 fill-current" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">FuelLens</h1>
        </div>
      </header>

      {/* アクションエリア（プレビュー or カメラボタン） */}
      <div className="relative overflow-hidden bg-gray-800/40 backdrop-blur-xl border border-gray-700/50 rounded-3xl mb-8 shadow-2xl transition-all">
        
        {/* ローディングオーバーレイ (画像の有無に関わらず表示) */}
        {loading && (
          <div className="absolute inset-0 z-50 bg-black/60 flex flex-col items-center justify-center backdrop-blur-sm">
            <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-3" />
            <p className="text-blue-200 font-medium animate-pulse text-sm">
              {loadingStep === "compress" ? "画像を圧縮中..." : "AIが解析中..."}
            </p>
          </div>
        )}

        {preview ? (
          /* ★プレビュー画像表示エリア */
          <div className="relative">
             {/* eslint-disable-next-line @next/next/no-img-element */}
            <img 
              src={preview} 
              alt="Preview" 
              className="w-full max-h-[300px] object-cover opacity-90" 
            />
            {/* 閉じるボタン (解析中でも押せるようにz-index調整はお好みで。今回は解析中は触れないようにLoadingの下) */}
            {!loading && (
              <button 
                onClick={clearPreview}
                className="absolute top-3 right-3 p-2 bg-black/50 rounded-full text-white backdrop-blur hover:bg-black/70 transition"
              >
                <X className="w-5 h-5" />
              </button>
            )}
            
            {/* 解析完了後の再撮影ボタン（画像の下部に配置） */}
            {!loading && (
              <div className="absolute bottom-3 right-3 flex gap-2">
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  className="bg-blue-600/90 hover:bg-blue-500 text-white text-xs font-bold py-2 px-4 rounded-full shadow-lg backdrop-blur flex items-center gap-2"
                >
                  <Camera className="w-3 h-3" /> 次を撮る
                </button>
              </div>
            )}
          </div>
        ) : (
          /* ★カメラボタンエリア（画像がない時だけ表示） */
          <div className="p-6 flex flex-col items-center gap-6">
            <div className="text-center space-y-1">
              <h2 className="text-lg font-semibold text-white">スキャンして記録</h2>
              <p className="text-sm text-gray-400">レシートとメーターを撮影</p>
            </div>

            <button
              onClick={() => cameraInputRef.current?.click()}
              disabled={loading}
              className="group relative w-24 h-24 rounded-full bg-gradient-to-b from-blue-500 to-blue-700 shadow-[0_0_40px_-10px_rgba(59,130,246,0.5)] flex items-center justify-center transition-transform active:scale-95"
            >
              <div className="absolute inset-0 rounded-full border-4 border-blue-400/30 group-hover:border-blue-400/50 transition-colors" />
              <Camera className="w-10 h-10 text-white fill-blue-500" />
            </button>

            <button
              onClick={() => galleryInputRef.current?.click()}
              disabled={loading}
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-blue-400 transition-colors py-2 px-4 rounded-full hover:bg-gray-800"
            >
              <ImageIcon className="w-4 h-4" />
              <span>アルバムから選択</span>
            </button>
          </div>
        )}
      </div>

      {/* 隠しinput */}
      <input type="file" accept="image/*" capture="environment" className="hidden" ref={cameraInputRef} onChange={handleFileChange} />
      <input type="file" accept="image/*" className="hidden" ref={galleryInputRef} onChange={handleFileChange} />

      {/* 最新リザルトカード */}
      {latestRecord && (
        <div className="mb-8 animate-in slide-in-from-bottom-5 duration-500">
          <div className="flex items-center justify-between px-2 mb-2">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
              <Calculator className="w-4 h-4" /> Latest Record
            </h3>
            {!isEditing && (
              <button 
                onClick={() => startEditing(latestRecord)}
                className="text-xs text-blue-400 flex items-center gap-1 hover:text-blue-300 transition"
              >
                <Edit2 className="w-3 h-3" /> 編集
              </button>
            )}
          </div>

          <div className={`relative overflow-hidden rounded-3xl border transition-all duration-300 ${isEditing ? 'bg-gray-800 border-blue-500 ring-1 ring-blue-500' : 'bg-gradient-to-br from-gray-800 to-gray-900 border-gray-700'}`}>
            
            {/* 編集モード */}
            {isEditing && editForm ? (
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">給油量 (L)</label>
                    <input 
                      type="number" 
                      value={editForm.fuel_amount || ""} 
                      onChange={(e) => handleInputChange(e, "fuel_amount")}
                      className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2 text-white font-mono focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">支払総額 (円)</label>
                    <input 
                      type="number" 
                      value={editForm.total_cost || ""} 
                      onChange={(e) => handleInputChange(e, "total_cost")}
                      className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2 text-white font-mono focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">走行距離 (km)</label>
                    <input 
                      type="number" 
                      value={editForm.total_distance || ""} 
                      onChange={(e) => handleInputChange(e, "total_distance")}
                      className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2 text-white font-mono focus:border-blue-500 outline-none"
                    />
                  </div>
                  
                  <div className="relative">
                    <label className="text-xs text-gray-500 block mb-1 flex items-center gap-1">
                       単価 (円/L) <Lock className="w-3 h-3 opacity-50"/>
                    </label>
                    <input 
                      type="number" 
                      value={editForm.price_per_unit || ""} 
                      readOnly 
                      className="w-full bg-gray-950/50 border border-gray-800 rounded-lg p-2 text-gray-500 font-mono focus:outline-none cursor-not-allowed"
                    />
                  </div>
                </div>
                <div>
                   <label className="text-xs text-gray-500 block mb-1">ガソリンスタンド名</label>
                   <input 
                      type="text" 
                      value={editForm.gas_station || ""} 
                      onChange={(e) => handleInputChange(e, "gas_station")}
                      className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2 text-white text-sm focus:border-blue-500 outline-none"
                    />
                </div>

                <div className="flex gap-3 pt-2">
                  <button onClick={cancelEditing} className="flex-1 py-3 rounded-xl bg-gray-700 text-white font-bold flex items-center justify-center gap-2">
                    <X className="w-4 h-4" /> キャンセル
                  </button>
                  <button onClick={saveEditing} className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-900/50">
                    <Save className="w-4 h-4" /> 保存
                  </button>
                </div>
              </div>
            ) : (
              /* 表示モード */
              <div className="p-6">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> {latestRecord.date || "日付不明"}
                    </p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold text-white font-mono tracking-tighter">
                        {latestRecord.fuel_efficiency ? latestRecord.fuel_efficiency.toFixed(2) : "--.--"}
                      </span>
                      <span className="text-sm font-bold text-blue-500">km/L</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-green-400 font-mono">
                      ¥{latestRecord.total_cost?.toLocaleString() || "---"}
                    </p>
                    <p className="text-xs text-gray-500">Total Cost</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 bg-black/20 rounded-xl p-4 border border-white/5">
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase">給油量</p>
                    <p className="text-lg font-mono font-bold text-blue-200">{latestRecord.fuel_amount} <span className="text-xs text-gray-500">L</span></p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase">走行距離</p>
                    <p className="text-lg font-mono font-bold text-gray-200">{latestRecord.total_distance} <span className="text-xs text-gray-500">km</span></p>
                  </div>
                  <div className="col-span-2 flex items-center gap-2 pt-2 border-t border-white/5">
                    <MapPin className="w-3 h-3 text-gray-500" />
                    <p className="text-xs text-gray-400 truncate">{latestRecord.gas_station || "場所不明"}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 過去の履歴リスト */}
      {pastRecords.length > 0 && (
        <div className="opacity-60 hover:opacity-100 transition-opacity">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 px-2 flex items-center gap-2">
            <History className="w-3 h-3" /> History
          </h3>
          <div className="space-y-2">
            {pastRecords.map((rec) => (
              <div key={rec.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center text-gray-400 font-mono text-sm font-bold">
                    {rec.fuel_efficiency?.toFixed(1) || "-"}
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">{rec.date}</p>
                    <p className="text-sm text-gray-300 truncate w-32">{rec.gas_station}</p>
                  </div>
                </div>
                <div className="text-right">
                   <p className="text-sm font-mono text-gray-400">¥{rec.total_cost?.toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
          <button className="w-full py-4 text-center text-xs text-gray-500 hover:text-white transition mt-2">
            すべての履歴を見る →
          </button>
        </div>
      )}
    </main>
  );
}