"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
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
  X,     
  Calculator,
  ChevronRight,
  BarChart3 
} from "lucide-react";
import imageCompression from "browser-image-compression";
import { useFuelRecords, FuelRecord } from "@/lib/useFuelRecords";
import EditFuelRecordForm from "@/components/EditFuelRecordForm";
import { calculateFuelMetrics } from "@/lib/calculations";
import { useVehicles } from "@/lib/useVehicles";
import VehicleSelector from "@/components/VehicleSelector";

export default function Home() {
  // 車両管理フックの統合
  const { vehicles, selectedVehicleId, setSelectedVehicleId, addVehicle, deleteVehicle, updateVehicle, loading: vehiclesLoading } = useVehicles();
  // 選択中車両IDと既定（先頭）車両IDを渡してレコード一覧を動的に同期。
  // 既定車両IDは、未分類（vehicle_id=null）の記録をどの車両に含めるか判定するために使う。
  const { records, addRecord, updateRecord, loading: recordsLoading } = useFuelRecords(selectedVehicleId, vehicles[0]?.id);

  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<"compress" | "analyze" | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  
  // スキャン直後のレコードIDを保持し、優先表示するためのステート
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [isManualEntry, setIsManualEntry] = useState(false);
  const [editForm, setEditForm] = useState<Partial<FuelRecord> | null>(null);
  
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  // クリップボードからのペースト対応
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      // 入力フォーム等にフォーカスがある場合は無視する
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }
      
      const file = e.clipboardData?.files?.[0];
      if (!file) return;
      
      if (!file.type.startsWith("image/")) {
        alert("画像ファイルのみペースト可能です。");
        return;
      }
      
      e.preventDefault();
      await processImageFileRef.current(file);
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  const isLoading = vehiclesLoading || recordsLoading;

  const processImageFile = async (file: File) => {
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
      reader.onerror = () => {
        console.error("画像の読み込みに失敗しました");
        setLoading(false);
        setLoadingStep(null);
        alert("画像の読み込みに失敗しました");
      };
      reader.readAsDataURL(compressedFile);
    } catch (error) {
      console.error(error);
      setLoading(false);
      alert("画像の処理に失敗しました");
    }
  };

  // processImageFile の最新版を参照するための ref
  const processImageFileRef = useRef(processImageFile);
  useEffect(() => {
    processImageFileRef.current = processImageFile;
  });

  // 画像処理
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    await processImageFile(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("画像ファイルのみアップロード可能です。");
      return;
    }

    await processImageFile(file);
  };

  // AI解析
  const analyzeImage = async (base64: string) => {
    setLoadingStep("analyze");

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        body: JSON.stringify({ imageBase64: base64 }),
      });

      if (!res.ok) {
        let errorText = "サーバーエラーが発生しました。";
        try {
          const errData = await res.json();
          if (errData && errData.error) {
            errorText = errData.error;
          }
        } catch {
          if (res.status === 429) {
            errorText = "リクエストが多すぎます。しばらくお待ちください。";
          }
        }
        throw new Error(errorText);
      }

      const data = await res.json();

      const metrics = calculateFuelMetrics(data.total_distance, data.fuel_amount, data.total_cost);

      const newRecordData = {
        date: data.date,
        total_distance: data.total_distance,
        fuel_amount: data.fuel_amount,
        gas_station: data.gas_station,
        price_per_unit: metrics.price_per_unit ?? data.price_per_unit,
        total_cost: data.total_cost,
        fuel_efficiency: metrics.fuel_efficiency,
      };

      const added = await addRecord(newRecordData);
      
      if (added && added.id) {
        setActiveRecordId(added.id);
      }

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "解析に失敗しました。";
      alert(errorMessage);
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

  const startManualEntry = () => {
    const d = new Date();
    const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    
    setEditForm({ 
      date: todayStr,
      total_distance: null,
      fuel_amount: null,
      gas_station: "",
      price_per_unit: null,
      total_cost: null,
    });
    setIsManualEntry(true);
    setIsEditing(true);
    setActiveRecordId(null);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setIsManualEntry(false);
    setEditForm(null);
  };

  const saveEditing = async () => {
    if (!editForm) return;

    const metrics = calculateFuelMetrics(editForm.total_distance, editForm.fuel_amount, editForm.total_cost);

    if (isManualEntry) {
      const newRecordData = {
        ...editForm,
        date: editForm.date || new Date().toISOString().split("T")[0],
        price_per_unit: metrics.price_per_unit ?? editForm.price_per_unit,
        fuel_efficiency: metrics.fuel_efficiency 
      };
      
      const added = await addRecord(newRecordData as Omit<FuelRecord, "id" | "vehicle_id">);
      if (added && added.id) {
        setActiveRecordId(added.id);
      }
      setIsManualEntry(false);
    } else {
      if (!editForm.id) return;
      const { id, ...updates } = editForm;
      await updateRecord(id as string, { 
        ...updates, 
        price_per_unit: metrics.price_per_unit ?? editForm.price_per_unit,
        fuel_efficiency: metrics.fuel_efficiency 
      });
    }
    
    setIsEditing(false);
    setEditForm(null);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>, field: keyof FuelRecord) => {
    if (!editForm) return;
    const val = e.target.value;
    
    const newForm: Partial<FuelRecord> = { ...editForm };
    const numFields = ["total_distance", "fuel_amount", "price_per_unit", "total_cost"];
    
    if (numFields.includes(field)) {
      const num = parseFloat(val);
      // 空欄・非数値・負数は無効としてnull/0に丸め、不正なデータの保存を防ぐ
      (newForm as Record<string, unknown>)[field] = val === "" || isNaN(num) ? null : Math.max(0, num);
    } else {
      (newForm as Record<string, unknown>)[field] = val;
    }

    if (field === "fuel_amount" || field === "total_cost") {
      const amount = newForm.fuel_amount;
      const cost = newForm.total_cost;
      if (amount != null && cost != null && amount > 0) {
        newForm.price_per_unit = Math.round(cost / amount);
      } else {
        newForm.price_per_unit = null;
      }
    }
    setEditForm(newForm);
  };

  // 表示するレコードの決定ロジック
  const displayRecord = activeRecordId 
    ? records.find(r => r.id === activeRecordId) || records[0]
    : records[0];

  const currentVehicleName = mounted
    ? vehicles.find(v => v.id === selectedVehicleId)?.name || "車両"
    : "車両";

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white p-4 md:p-8 pb-32 font-sans flex flex-col items-center">
      <div className="w-full max-w-5xl">
      
        {/* ヘッダー */}
        <header className="flex items-center justify-between py-4 mb-2 w-full">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-gradient-to-tr from-blue-600 to-cyan-400 rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/20">
              <Fuel className="text-white w-6 h-6 fill-current" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">FuelLens</h1>
          </div>
          
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
              <SignInButton forceRedirectUrl="/app">
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

        {/* 車両切り替えセレクタータブ */}
        {vehiclesLoading ? (
          <div className="w-full mb-6">
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
              <div className="flex items-center gap-2 p-1.5 bg-gray-950/40 border border-gray-800/80 rounded-2xl shadow-inner">
                <div className="w-20 h-8 md:h-[36px] bg-gray-850 rounded-xl animate-pulse" />
                <div className="w-20 h-8 md:h-[36px] bg-gray-850 rounded-xl animate-pulse" />
                <div className="w-[34px] h-[34px] bg-gray-850 rounded-xl animate-pulse" />
              </div>
            </div>
          </div>
        ) : (
          <VehicleSelector 
            vehicles={vehicles} 
            selectedVehicleId={selectedVehicleId} 
            onSelect={setSelectedVehicleId} 
            onAddVehicle={addVehicle} 
            onDeleteVehicle={deleteVehicle}
            onUpdateVehicle={updateVehicle}
          />
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start w-full">
          <div className="flex flex-col gap-6 w-full">
            {/* アクションエリア */}
            {isLoading ? (
              <div className="relative overflow-hidden bg-gray-800/40 backdrop-blur-xl border border-gray-700/50 rounded-3xl shadow-2xl w-full">
                <div className="p-6 flex flex-col items-center gap-6 text-center">
                  <div className="space-y-1">
                    <h2 className="text-lg font-semibold text-white">スキャンして記録</h2>
                    <p className="text-xs text-blue-500/40">対象: 車両</p>
                    <p className="text-sm text-gray-500">レシートとメーターを1枚に収めて撮影</p>
                  </div>
                  <div className="w-24 h-24 rounded-full bg-gray-800/60 animate-pulse border-4 border-gray-800/30" />
                  <div className="w-32 h-9 bg-gray-800/40 rounded-full animate-pulse" />
                </div>
              </div>
            ) : (
              <div 
                onDragOver={handleDragOver}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`relative overflow-hidden bg-gray-800/40 backdrop-blur-xl border rounded-3xl shadow-2xl transition-all duration-300 w-full ${
                  isDragging ? "border-blue-500 bg-blue-500/10 scale-[1.01]" : "border-gray-700/50"
                }`}
              >
                {isDragging && (
                  <div className="absolute inset-0 z-50 bg-blue-600/20 border-2 border-dashed border-blue-500 rounded-3xl flex flex-col items-center justify-center backdrop-blur-xs pointer-events-none transition-all duration-300">
                    <div className="bg-gray-900/90 border border-blue-500/30 p-4 rounded-2xl flex flex-col items-center gap-2 shadow-2xl animate-pulse">
                      <Camera className="w-8 h-8 text-blue-400" />
                      <p className="text-sm font-bold text-white">ここに画像をドロップして解析</p>
                    </div>
                  </div>
                )}

                {loading && (
                  <div className="absolute inset-0 z-50 bg-black/60 flex flex-col items-center justify-center backdrop-blur-sm">
                    <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-3" />
                    <p className="text-blue-200 font-medium animate-pulse text-sm">
                      {loadingStep === "compress" ? "画像を圧縮中..." : "AIが解析中..."}
                    </p>
                  </div>
                )}

                <div className={isDragging ? "pointer-events-none" : ""}>
                  {preview ? (
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img 
                        src={preview} 
                        alt="Preview" 
                        className="w-full max-h-[300px] object-cover opacity-90" 
                        draggable="false"
                      />
                      {!loading && (
                        <button 
                          onClick={clearPreview}
                          className="absolute top-3 right-3 p-2 bg-black/50 rounded-full text-white backdrop-blur hover:bg-black/70 transition pointer-events-auto"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      )}
                      {!loading && (
                        <div className="absolute bottom-3 right-3 flex gap-2">
                          <button
                            onClick={() => cameraInputRef.current?.click()}
                            className="bg-blue-600/90 hover:bg-blue-500 text-white text-xs font-bold py-2 px-4 rounded-full shadow-lg backdrop-blur flex items-center gap-2 pointer-events-auto"
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
                        <p className="text-xs text-blue-400 font-semibold">対象: {currentVehicleName}</p>
                        <p className="text-sm text-gray-400">レシートとメーターを1枚に収めて撮影</p>
                        <p className="text-xs text-amber-500/80 pt-1">走行距離はトリップメーター（前回給油からの区間距離）を入力してください</p>
                      </div>

                      <button
                        onClick={() => cameraInputRef.current?.click()}
                        disabled={loading}
                        className="group relative w-24 h-24 rounded-full bg-gradient-to-b from-blue-500 to-blue-700 shadow-[0_0_40px_-10px_rgba(59,130,246,0.5)] flex items-center justify-center transition-transform active:scale-95"
                      >
                        <div className="absolute inset-0 rounded-full border-4 border-blue-400/30 group-hover:border-blue-400/50 transition-colors" />
                        <Camera className="w-10 h-10 text-white fill-blue-500" />
                      </button>

                      <div className="flex items-center gap-4">
                        <button
                          onClick={() => galleryInputRef.current?.click()}
                          disabled={loading}
                          className="flex items-center gap-2 text-sm text-gray-500 hover:text-blue-400 transition-colors py-2 px-4 rounded-full hover:bg-gray-800"
                        >
                          <ImageIcon className="w-4 h-4" />
                          <span>アルバムから選択</span>
                        </button>
                        <button
                          onClick={startManualEntry}
                          disabled={loading}
                          className="flex items-center gap-2 text-sm text-gray-500 hover:text-blue-400 transition-colors py-2 px-4 rounded-full hover:bg-gray-800"
                        >
                          <Edit2 className="w-4 h-4" />
                          <span>手動で入力</span>
                        </button>
                      </div>

                      <p className="text-xs text-gray-500">画像のペースト（Ctrl+V）にも対応</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            <input type="file" accept="image/*" capture="environment" className="hidden" ref={cameraInputRef} onChange={handleFileChange} />
            <input type="file" accept="image/*" className="hidden" ref={galleryInputRef} onChange={handleFileChange} />
          </div>

          {/* 右カラム (最新リザルト + 履歴ボタン) */}
          <div className="flex flex-col gap-6 w-full">
            {/* 最新リザルトカード */}
            {isLoading ? (
              <div>
                <div className="flex items-center justify-between px-2 mb-2">
                  <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                    <Calculator className="w-4 h-4" /> Latest Record
                  </h3>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden w-full">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <div className="w-12 h-3 bg-gray-800 rounded animate-pulse mb-2" />
                      <div className="flex items-baseline gap-1">
                        <div className="w-24 h-9 bg-gray-800 rounded animate-pulse" />
                        <span className="text-sm font-bold text-blue-500">km/L</span>
                      </div>
                    </div>
                    <div className="text-right flex flex-col items-end">
                      <div className="w-16 h-7 bg-gray-800 rounded animate-pulse mb-1" />
                      <p className="text-xs text-gray-500">Total Cost</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 bg-black/20 rounded-xl p-4 border border-white/5">
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase mb-2">給油量</p>
                      <div className="w-12 h-5 bg-gray-800 rounded animate-pulse" />
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase mb-2">走行距離</p>
                      <div className="w-16 h-5 bg-gray-800 rounded animate-pulse" />
                    </div>
                    <div className="col-span-2 flex items-center gap-2 pt-2 border-t border-white/5">
                      <MapPin className="w-3 h-3 text-gray-500" />
                      <div className="w-24 h-3 bg-gray-800 rounded animate-pulse" />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mb-8 w-full">
                <div className="flex items-center justify-between px-2 mb-2">
                  <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                    <Calculator className="w-4 h-4" /> {isManualEntry ? "New Record" : (displayRecord && activeRecordId === displayRecord.id ? "Scanned Result" : "Latest Record")}
                  </h3>
                  {displayRecord && !isEditing && (
                    <button 
                      onClick={() => startEditing(displayRecord)}
                      className="text-xs text-blue-400 flex items-center gap-1 hover:text-blue-300 transition"
                    >
                      <Edit2 className="w-3 h-3" /> 編集
                    </button>
                  )}
                </div>

                {(displayRecord || (isEditing && isManualEntry)) ? (
                  <div className={`relative overflow-hidden rounded-3xl border transition-colors duration-300 w-full ${isEditing ? 'bg-gray-800 border-blue-500 ring-1 ring-blue-500' : 'bg-gradient-to-br from-gray-800 to-gray-900 border-gray-700'}`}>
                    {/* 編集モード */}
                    {isEditing && editForm ? (
                      <div className="p-5">
                        <h3 className="text-sm font-bold text-gray-300 mb-4">{isManualEntry ? "手動で記録を追加" : "給油記録の編集"}</h3>
                        <EditFuelRecordForm 
                          editForm={editForm}
                          handleInputChange={handleInputChange}
                          cancelEditing={cancelEditing}
                          saveEditing={saveEditing}
                        />
                      </div>
                    ) : (
                      /* 表示モード */
                      <div className="p-6">
                        <div className="flex justify-between items-start mb-6">
                          <div>
                            <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                              <Calendar className="w-3 h-3" /> {displayRecord.date || "日付不明"}
                            </p>
                            <div className="flex items-baseline gap-1">
                              <span className="text-4xl font-bold text-white font-mono tracking-tighter">
                                {displayRecord.fuel_efficiency ? displayRecord.fuel_efficiency.toFixed(2) : "--.--"}
                              </span>
                              <span className="text-sm font-bold text-blue-500">km/L</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-bold text-green-400 font-mono">
                              ¥{displayRecord.total_cost?.toLocaleString() || "---"}
                            </p>
                            <p className="text-xs text-gray-500">Total Cost</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 bg-black/20 rounded-xl p-4 border border-white/5">
                          <div>
                            <p className="text-[10px] text-gray-400 uppercase">給油量</p>
                            <p className="text-lg font-mono font-bold text-blue-200">{displayRecord.fuel_amount} <span className="text-xs text-gray-500">L</span></p>
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-400 uppercase">走行距離</p>
                            <p className="text-lg font-mono font-bold text-gray-200">{displayRecord.total_distance} <span className="text-xs text-gray-500">km</span></p>
                          </div>
                          <div className="col-span-2 flex items-center gap-2 pt-2 border-t border-white/5">
                             <MapPin className="w-3 h-3 text-gray-500" />
                            <p className="text-xs text-gray-400 truncate">{displayRecord.gas_station || "場所不明"}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-gray-900/30 border border-gray-800/80 rounded-3xl p-8 text-center flex flex-col items-center justify-center min-h-[220px] w-full">
                    <div className="w-12 h-12 rounded-full bg-gray-800/50 flex items-center justify-center mb-3">
                      <Fuel className="w-6 h-6 text-gray-500" />
                    </div>
                    <p className="text-sm font-bold text-gray-300 mb-1">給油記録がまだありません</p>
                    <p className="text-xs text-gray-500 max-w-[280px] leading-relaxed">
                      レシートやメーターの写真をスキャンするか、過去の記録を入力して最初の記録を作成しましょう！
                    </p>
                  </div>
                )}
              </div>
            )}
            
            {/* 履歴画面へのリンクボタン */}
            <div className="mt-auto w-full">
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
                    <p className="text-sm text-gray-500">対象: {currentVehicleName}</p>
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
