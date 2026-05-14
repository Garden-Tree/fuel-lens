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

/**
 * レコード配列を「給油日 (date) の降順」で安全にソートするヘルパー関数
 */
function sortRecordsByDateDesc(list: FuelRecord[]): FuelRecord[] {
  return [...list].sort((a, b) => {
    const timeA = a.date ? new Date(a.date).getTime() : 0;
    const timeB = b.date ? new Date(b.date).getTime() : 0;
    if (timeB !== timeA) {
      return timeB - timeA;
    }
    // 日付が同一の場合はID文字列（または順序）で安定ソート
    return b.id > a.id ? 1 : -1;
  });
}

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
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setRecords(sortRecordsByDateDesc(parsed));
        } catch (e) {
          console.error("ローカルデータのパース失敗", e);
          setRecords([]);
        }
      } else {
        setRecords([]);
      }
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
        // 二重実行を防ぐため、処理開始前にローカルストレージから削除
        localStorage.removeItem("fuel_lens_data");
        try {
          const parsedLocal: FuelRecord[] = JSON.parse(localData);
          if (parsedLocal.length > 0) {
            const recordsToInsert = parsedLocal.map(r => {
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const { id: _, ...rest } = r;
              // idフィールドは除外(CloudでUUID自動生成させるため)
              return { ...rest, user_id: userId };
            });

            // Bulk insert
            const { error: insertError } = await supabase.from("fuel_records").insert(recordsToInsert);
            
            if (insertError) {
              console.error("マイグレーションに失敗しました", insertError);
              // 失敗時は安全にローカルストレージへ復元
              localStorage.setItem("fuel_lens_data", localData);
            }
          }
        } catch (err) {
          console.error("マイグレーション処理中に例外が発生しました", err);
          localStorage.setItem("fuel_lens_data", localData);
        }
      }

      // Supabaseから実際のデータを取得 (date降順を基本とする)
      const { data, error } = await supabase
        .from("fuel_records")
        .select("*")
        .order("date", { ascending: false });

      if (error) throw error;
      
      // クライアント側でも念のため給油日順ソートを徹底
      setRecords(sortRecordsByDateDesc(data as FuelRecord[]));
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
      const newRecord: FuelRecord = { ...record, id: Date.now().toString() };
      setRecords(prev => {
        const updated = sortRecordsByDateDesc([newRecord, ...prev]);
        localStorage.setItem("fuel_lens_data", JSON.stringify(updated));
        return updated;
      });
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
    
    // ステート追加時も一貫してソート順を維持
    setRecords(prev => sortRecordsByDateDesc([data as FuelRecord, ...prev]));
    return data as FuelRecord;
  };

  const updateRecord = async (id: string, updates: Partial<FuelRecord>) => {
    if (!isSignedIn) {
      setRecords(prev => {
        const updated = prev.map(r => r.id === id ? { ...r, ...updates } : r);
        const sorted = sortRecordsByDateDesc(updated);
        localStorage.setItem("fuel_lens_data", JSON.stringify(sorted));
        return sorted;
      });
      return;
    }

    const token = await getToken({ template: "supabase" });
    const supabase = createClerkSupabaseClient(token!);
    const { error } = await supabase.from("fuel_records").update(updates).eq("id", id);
    if (error) throw error;

    setRecords(prev => sortRecordsByDateDesc(
      prev.map(r => r.id === id ? { ...r, ...updates } : r)
    ));
  };

  const deleteRecord = async (id: string) => {
    if (!isSignedIn) {
      setRecords(prev => {
        const updated = prev.filter(r => r.id !== id);
        localStorage.setItem("fuel_lens_data", JSON.stringify(updated));
        return updated;
      });
      return;
    }

    const token = await getToken({ template: "supabase" });
    const supabase = createClerkSupabaseClient(token!);
    const { error } = await supabase.from("fuel_records").delete().eq("id", id);
    if (error) throw error;

    setRecords(prev => prev.filter(r => r.id !== id));
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
