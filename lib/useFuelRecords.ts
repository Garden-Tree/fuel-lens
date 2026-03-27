import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import { createClerkSupabaseClient } from "./supabaseClient";

export type FuelRecord = {
  id: string;
  date: string;
  total_distance: number | null;
  fuel_amount: number | null;
  gas_station: string | null;
  price_per_unit: number | null;
  total_cost: number | null;
  fuel_efficiency: number | null;
};

export function useFuelRecords() {
  const { getToken, userId, isSignedIn, isLoaded } = useAuth();
  const [records, setRecords] = useState<FuelRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!isLoaded) return;

    setLoading(true);
    if (!isSignedIn) {
      // 未ログイン: ローカルストレージを利用
      const saved = localStorage.getItem("fuel_lens_data");
      if (saved) setRecords(JSON.parse(saved));
      else setRecords([]);
      setLoading(false);
      return;
    }

    // ログイン済: Supabaseから取得 + マイグレーション
    try {
      const token = await getToken({ template: "supabase" });
      if (!token) throw new Error("No Auth Token for Supabase");
      const supabase = createClerkSupabaseClient(token);

      // マイグレーション確認 (ローカルにデータがあればSupabaseへアップロード)
      const localData = localStorage.getItem("fuel_lens_data");
      if (localData) {
        const parsedLocal: FuelRecord[] = JSON.parse(localData);
        if (parsedLocal.length > 0) {
          const recordsToInsert = parsedLocal.map(r => {
            const { id, ...rest } = r;
            // idフィールドはUUIDを使いたいため除外(Cloudで生成)
            return { ...rest, user_id: userId };
          });

          for (const rec of recordsToInsert) {
            await supabase.from("fuel_records").insert(rec);
          }
          localStorage.removeItem("fuel_lens_data");
        }
      }

      // Supabaseから実際のデータを取得
      const { data, error } = await supabase
        .from("fuel_records")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setRecords(data as FuelRecord[]);
    } catch (e) {
      console.error("データの取得に失敗しました", e);
    } finally {
      setLoading(false);
    }
  }, [isSignedIn, isLoaded, userId, getToken]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const addRecord = async (record: Omit<FuelRecord, 'id'>) => {
    if (!isSignedIn) {
      const newRecord = { ...record, id: Date.now().toString() };
      const newRecords = [newRecord, ...records];
      setRecords(newRecords);
      localStorage.setItem("fuel_lens_data", JSON.stringify(newRecords));
      return newRecord;
    }

    const token = await getToken({ template: "supabase" });
    const supabase = createClerkSupabaseClient(token!);
    const { data, error } = await supabase
      .from("fuel_records")
      .insert({ ...record, user_id: userId })
      .select()
      .single();

    if (error) throw error;
    setRecords([data, ...records]);
    return data;
  };

  const updateRecord = async (id: string, updates: Partial<FuelRecord>) => {
    if (!isSignedIn) {
      const newRecords = records.map(r => r.id === id ? { ...r, ...updates } : r);
      setRecords(newRecords);
      localStorage.setItem("fuel_lens_data", JSON.stringify(newRecords));
      return;
    }

    const token = await getToken({ template: "supabase" });
    const supabase = createClerkSupabaseClient(token!);
    const { error } = await supabase.from("fuel_records").update(updates).eq("id", id);
    if (error) throw error;

    setRecords(records.map(r => r.id === id ? { ...r, ...updates } : r));
  };

  const deleteRecord = async (id: string) => {
    if (!isSignedIn) {
      const newRecords = records.filter(r => r.id !== id);
      setRecords(newRecords);
      localStorage.setItem("fuel_lens_data", JSON.stringify(newRecords));
      return;
    }

    const token = await getToken({ template: "supabase" });
    const supabase = createClerkSupabaseClient(token!);
    const { error } = await supabase.from("fuel_records").delete().eq("id", id);
    if (error) throw error;

    setRecords(records.filter(r => r.id !== id));
  };

  return {
    records,
    loading,
    addRecord,
    updateRecord,
    deleteRecord,
    refresh: loadData
  };
}
