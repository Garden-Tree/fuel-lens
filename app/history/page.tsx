"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import { ArrowLeft, Trash2, MapPin, Calendar, BarChart3, Edit2 } from "lucide-react";

import { useFuelRecords, FuelRecord } from "@/lib/useFuelRecords";
import EditFuelRecordForm from "@/components/EditFuelRecordForm";
import { calculateFuelMetrics } from "@/lib/calculations";

export default function HistoryPage() {
  const { records, deleteRecord, updateRecord } = useFuelRecords();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<FuelRecord> | null>(null);

  const [sortType, setSortType] = useState<"date" | "created_at">("date");

  const sortedRecords = useMemo(() => {
    if (sortType === "created_at") {
      // 登録順の場合は、records配列そのまま（取得時の並び順に依存）
      return records;
    }
    // 給油日順
    return [...records].sort((a, b) => {
      const dateA = a.date ? new Date(a.date).getTime() : 0;
      const dateB = b.date ? new Date(b.date).getTime() : 0;
      if (dateB !== dateA) return dateB - dateA;
      return b.id > a.id ? 1 : -1;
    });
  }, [records, sortType]);

  // 削除機能
  const handleDelete = async (id: string) => {
    if (!confirm("この記録を削除しますか？")) return;
    try {
      await deleteRecord(id);
    } catch {
      alert("削除に失敗しました");
    }
  };

  // 編集開始
  const startEditing = (record: FuelRecord) => {
    setEditingId(record.id);
    setEditForm({ ...record });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditForm(null);
  };

  const saveEditing = async () => {
    if (!editForm || !editForm.id) return;
    
    // 共通関数を利用して単価と燃費を安全に計算
    const metrics = calculateFuelMetrics(editForm.total_distance, editForm.fuel_amount, editForm.total_cost);

    const { id, ...updates } = editForm;
    await updateRecord(id as string, { 
      ...updates, 
      price_per_unit: metrics.price_per_unit ?? editForm.price_per_unit,
      fuel_efficiency: metrics.fuel_efficiency 
    });
    
    setEditingId(null);
    setEditForm(null);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>, field: keyof FuelRecord) => {
    if (!editForm) return;
    const val = e.target.value;
    
    const newForm: Partial<FuelRecord> = { ...editForm };
    const numFields = ["total_distance", "fuel_amount", "price_per_unit", "total_cost"];
    
    if (numFields.includes(field)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (newForm as any)[field] = val === "" ? null : parseFloat(val);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (newForm as any)[field] = val;
    }

    // 単価のリアルタイム計算
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

  return (
    <main className="min-h-screen bg-black text-white p-4 md:p-8 pb-20 font-sans flex flex-col items-center">
      <div className="w-full max-w-5xl">

        {/* ヘッダー */}
        <header className="flex items-center justify-between py-4 mb-6 md:mb-10 sticky top-0 bg-black/80 backdrop-blur-md z-10">
          <div className="flex items-center gap-4">
            <Link href="/" className="p-2 bg-gray-900 rounded-full hover:bg-gray-800 transition">
              <ArrowLeft className="w-5 h-5 text-gray-300" />
            </Link>
            <h1 className="text-xl md:text-2xl font-bold">給油履歴</h1>
          </div>
          
          <div className="flex items-center gap-3">
            <Link href="/stats" className="p-2 bg-gray-900 rounded-full hover:bg-gray-800 transition text-gray-300 group flex items-center gap-2">
              <span className="hidden sm:inline text-sm font-bold pr-1">グラフを見る</span>
              <BarChart3 className="w-5 h-5 text-blue-400" />
            </Link>

            <SignedOut>
              <SignInButton forceRedirectUrl="/history">
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

        {/* 操作パネル */}
        {records.length > 0 && (
          <div className="flex justify-end mb-4">
            <div className="flex items-center gap-1 bg-gray-900 rounded-lg p-1 border border-gray-800">
              <button
                onClick={() => setSortType("date")}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition ${sortType === "date" ? "bg-blue-600 text-white shadow-sm" : "text-gray-400 hover:text-white"}`}
              >
                給油日順
              </button>
              <button
                onClick={() => setSortType("created_at")}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition ${sortType === "created_at" ? "bg-blue-600 text-white shadow-sm" : "text-gray-400 hover:text-white"}`}
              >
                登録順
              </button>
            </div>
          </div>
        )}

        {/* リスト表示 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {sortedRecords.length === 0 ? (
            <div className="text-center py-20 text-gray-600 col-span-full">
              <p>履歴がありません</p>
            </div>
          ) : (
            sortedRecords.map((rec) => (
              editingId === rec.id && editForm ? (
                <div key={`edit-${rec.id}`} className="bg-gray-800 border border-blue-500 ring-1 ring-blue-500 rounded-2xl p-5 relative">
                  <EditFuelRecordForm 
                    editForm={editForm}
                    handleInputChange={handleInputChange}
                    cancelEditing={cancelEditing}
                    saveEditing={saveEditing}
                  />
                </div>
              ) : (
                <div key={rec.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 relative group">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                        <Calendar className="w-3 h-3" />
                        {rec.date || "日付不明"}
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className={`text-2xl font-bold font-mono ${rec.fuel_efficiency ? 'text-white' : 'text-gray-600'}`}>
                          {rec.fuel_efficiency ? rec.fuel_efficiency.toFixed(2) : "--.--"}
                        </span>
                        <span className="text-xs font-bold text-blue-500">km/L</span>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <p className="text-lg font-bold text-green-400 font-mono">
                        ¥{rec.total_cost?.toLocaleString() || "---"}
                      </p>
                      <p className="text-[10px] text-gray-500">Total Cost</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm bg-black/20 p-3 rounded-lg">
                    <div className="flex justify-between border-r border-gray-800 pr-2">
                      <span className="text-gray-500 text-xs">給油量</span>
                      <span className="font-mono text-gray-300">{rec.fuel_amount} L</span>
                    </div>
                    <div className="flex justify-between pl-2">
                      <span className="text-gray-500 text-xs">走行</span>
                      <span className="font-mono text-gray-300">{rec.total_distance} km</span>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-2 text-xs text-gray-500 pr-16">
                    <MapPin className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{rec.gas_station || "SS不明"}</span>
                  </div>

                  {/* 操作ボタン群 */}
                  <div className="absolute bottom-4 right-4 flex items-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition duration-200">
                    <button 
                      onClick={() => startEditing(rec)}
                      className="p-1.5 text-gray-500 hover:text-blue-400 transition"
                      title="編集"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleDelete(rec.id)}
                      className="p-1.5 text-gray-500 hover:text-red-500 transition"
                      title="削除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )
            ))
          )}
        </div>
      </div>
    </main>
  );
}