"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link"; // ★追加: リンク用
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
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
  Lock,
  ChevronRight,
  TrendingUp,
  BarChart3 // ★追加: アイコン
} from "lucide-react";
import imageCompression from "browser-image-compression";
import { useFuelRecords, FuelRecord } from "@/lib/useFuelRecords";



export default function Home() {
  const { records, loading: recordsLoading, addRecord, updateRecord } = useFuelRecords();

  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<"compress" | "analyze" | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<FuelRecord> | null>(null);
  
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // 画像処理
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const options = {
      maxSizeMB: 0.8,
      maxWidthOrHeight: 1200,
      useWebWorker: false,
      fileType: "image/jpeg"
    };

    setLoading(true);
    setLoadingStep("compress");

    try {
      const compressedFile = await imageCompression(file, options);
      console.log(`圧縮成功: ${(compressedFile.size / 1024 / 1024).toFixed(2)} MB`);

      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target?.result as string;
        setPreview(base64);
        analyzeImage(base64);
      };
      reader.readAsDataURL(compressedFile);
    } catch (error) {
      console.error(error);
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

      let calcEfficiency = null;
      if (data.total_distance && data.fuel_amount && data.fuel_amount > 0) {
        calcEfficiency = parseFloat((data.total_distance / data.fuel_amount).toFixed(2));
      }

      const newRecord = {
        date: data.date,
        total_distance: data.total_distance,
        fuel_amount: data.fuel_amount,
        gas_station: data.gas_station,
        price_per_unit: data.price_per_unit,
        total_cost: data.total_cost,
        fuel_efficiency: calcEfficiency,
      };

      await addRecord(newRecord);
      
      // プレビューは維持

    } catch (err) {
      alert("解析に失敗しました。");
      console.error(err);
    } finally {
      setLoading(false);
      setLoadingStep(null);
    }
  };

  const clearPreview = () => {
    setPreview(null);
  };

  const startEditing = (record: FuelRecord) => {
    setEditForm({ ...record });
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditForm(null);
  };

  const saveEditing = async () => {
    if (!editForm || !editForm.id) return;

    let newEfficiency = editForm.fuel_efficiency;
    if (editForm.total_distance && editForm.fuel_amount && editForm.fuel_amount > 0) {
      newEfficiency = parseFloat((editForm.total_distance / editForm.fuel_amount).toFixed(2));
    }

    const { id, ...updates } = editForm;
    await updateRecord(id as string, { ...updates, fuel_efficiency: newEfficiency });
    
    setIsEditing(false);
    setEditForm(null);
  };

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

  // 最新の1件のみ取得
  const latestRecord = records[0];

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white p-4 md:p-8 pb-32 font-sans flex flex-col items-center">
      <div className="w-full max-w-5xl">
      
      {/* ヘッダー */}
      <header className="flex items-center justify-between py-4 mb-6">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-gradient-to-tr from-blue-600 to-cyan-400 rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/20">
            <Fuel className="text-white w-6 h-6 fill-current" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">FuelLens</h1>
        </div>
        
        {/* ヘッダーの履歴ボタンもリンクに変更 */}
        <div className="flex items-center gap-3">
          <Link href="/stats" className="p-2 bg-gray-800/50 rounded-full border border-gray-700/50 text-gray-400 hover:text-white transition group flex items-center gap-2">
            <span className="hidden md:inline text-sm font-semibold pr-1">グラフ</span>
            <BarChart3 className="w-5 h-5" />
          </Link>
          <Link href="/history" className="p-2 bg-gray-800/50 rounded-full border border-gray-700/50 text-gray-400 hover:text-white transition group flex items-center gap-2">
            <span className="hidden md:inline text-sm font-semibold pr-1">給油履歴</span>
            <History className="w-5 h-5" />
          </Link>

          <SignedOut>
            <SignInButton forceRedirectUrl="/">
              <button className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold py-1.5 px-4 rounded-full transition shadow-lg">
                ログイン
              </button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <UserButton />
          </SignedIn>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
        <div className="flex flex-col gap-6">
          {/* アクションエリア */}
          <div className="relative overflow-hidden bg-gray-800/40 backdrop-blur-xl border border-gray-700/50 rounded-3xl shadow-2xl transition-all">
        
        {loading && (
          <div className="absolute inset-0 z-50 bg-black/60 flex flex-col items-center justify-center backdrop-blur-sm">
            <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-3" />
            <p className="text-blue-200 font-medium animate-pulse text-sm">
              {loadingStep === "compress" ? "画像を圧縮中..." : "AIが解析中..."}
            </p>
          </div>
        )}

        {preview ? (
          <div className="relative">
             {/* eslint-disable-next-line @next/next/no-img-element */}
            <img 
              src={preview} 
              alt="Preview" 
              className="w-full max-h-[300px] object-cover opacity-90" 
            />
            {!loading && (
              <button 
                onClick={clearPreview}
                className="absolute top-3 right-3 p-2 bg-black/50 rounded-full text-white backdrop-blur hover:bg-black/70 transition"
              >
                <X className="w-5 h-5" />
              </button>
            )}
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

      <input type="file" accept="image/*" capture="environment" className="hidden" ref={cameraInputRef} onChange={handleFileChange} />
      <input type="file" accept="image/*" className="hidden" ref={galleryInputRef} onChange={handleFileChange} />
        </div>

      {/* 右カラム (最新リザルト + 履歴ボタン) */}
      <div className="flex flex-col gap-6">
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
        
        {/* 履歴画面へのリンクボタン */}
        <div className="mt-auto">
          <Link 
            href="/history"
            className="group flex items-center justify-between w-full p-4 md:p-6 rounded-2xl bg-gray-900 border border-gray-800 hover:border-gray-700 transition"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gray-800 rounded-xl">
                  <History className="w-6 h-6 text-gray-400" />
              </div>
              <div>
                  <p className="text-base md:text-lg font-bold text-gray-200">過去の記録を見る</p>
                  <p className="text-sm text-gray-500">{records.length}件の履歴</p>
              </div>
            </div>
            <ChevronRight className="w-6 h-6 text-gray-500 group-hover:text-white transition" />
          </Link>
        </div>

      </div>
      </div>
      </div>
    </main>
  );
}