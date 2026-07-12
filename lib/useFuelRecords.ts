import { useState, useEffect, useCallback, useRef } from "react";
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
  vehicle_id?: string | null;
  created_at?: string | null;
};

function sortRecordsByDateDesc(list: FuelRecord[]): FuelRecord[] {
  return [...list].sort((a, b) => {
    const timeA = a.date ? new Date(a.date).getTime() : 0;
    const timeB = b.date ? new Date(b.date).getTime() : 0;
    if (timeB !== timeA) return timeB - timeA;
    return b.id > a.id ? 1 : -1;
  });
}

export function useFuelRecords(selectedVehicleId?: string, defaultVehicleId?: string) {
  const { getToken, userId, isSignedIn, isLoaded } = useAuth();
  const [records, setRecords] = useState<FuelRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchCounter = useRef(0);

  const loadData = useCallback(async (fetchId: number) => {
    if (!isLoaded) return;
    setLoading(true);

    if (!isSignedIn) {
      const saved = typeof window !== "undefined" ? localStorage.getItem("fuel_lens_data") : null;
      if (fetchId !== fetchCounter.current) return;
      if (saved) {
        try {
          const parsed: FuelRecord[] = JSON.parse(saved);
          const filtered = parsed.filter(r => {
            if (!selectedVehicleId || selectedVehicleId.startsWith("default-")) {
              return !r.vehicle_id || r.vehicle_id.startsWith("default-");
            }
            return r.vehicle_id === selectedVehicleId;
          });
          setRecords(sortRecordsByDateDesc(filtered));
        } catch {
          setRecords([]);
        }
      } else {
        setRecords([]);
      }
      setLoading(false);
      return;
    }

    try {
      const token = await getToken({ template: "supabase" });
      if (!token) throw new Error("Missing Supabase Token");
      if (fetchId !== fetchCounter.current) return;
      const supabase = createClerkSupabaseClient(token);

      // ローカル給油データのマイグレーション
      const localData = typeof window !== "undefined" ? localStorage.getItem("fuel_lens_data") : null;
      if (localData) {
        try {
          const parsedLocal: FuelRecord[] = JSON.parse(localData);
          if (parsedLocal.length > 0) {
            const recordsToInsert = parsedLocal.map(r => {
              // UUID不一致や外部キーエラーを防ぐため、クラウド移行時はローカルの id と vehicle_id を安全に除外
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const { id: _, vehicle_id: __, ...rest } = r;
              return { ...rest, user_id: userId };
            });

            const { error: insertError } = await supabase.from("fuel_records").insert(recordsToInsert);
            if (!insertError) {
              // 成功した場合のみローカルデータを削除
              localStorage.removeItem("fuel_lens_data");
            }
          }
        } catch {
          // パースエラーの場合はローカルデータをそのまま保持
        }
      }

      // クエリ構築: 選択中の車両UUIDに一致するものを取得。
      // vehicle_id が null の記録（ローカルからの移行データなど未分類のもの）は
      // 「既定（先頭）車両」を選択している場合のみ含める。これを常に含めると、
      // 車両が複数あるとき全車両に同じ記録が重複表示・重複集計されてしまう。
      let query = supabase.from("fuel_records").select("*").order("date", { ascending: false });

      const isDefaultSelected =
        !selectedVehicleId ||
        selectedVehicleId.startsWith("default-") ||
        (defaultVehicleId != null && selectedVehicleId === defaultVehicleId);

      if (selectedVehicleId && !selectedVehicleId.startsWith("default-")) {
        if (isDefaultSelected) {
          query = query.or(`vehicle_id.eq.${selectedVehicleId},vehicle_id.is.null`);
        } else {
          query = query.eq("vehicle_id", selectedVehicleId);
        }
      } else {
        // 署名済みだが車両IDがまだ確定していない過渡状態。未分類の記録のみ取得する。
        query = query.is("vehicle_id", null);
      }

      const { data, error } = await query;
      if (fetchId !== fetchCounter.current) return;

      if (error) {
        const fallbackQuery = await supabase.from("fuel_records").select("*").order("date", { ascending: false });
        if (fetchId !== fetchCounter.current) return;
        setRecords(fallbackQuery.data ? sortRecordsByDateDesc(fallbackQuery.data as FuelRecord[]) : []);
        setLoading(false);
        return;
      }

      setRecords(sortRecordsByDateDesc(data as FuelRecord[]));
    } catch (e) {
      console.error("給油データの取得失敗:", e);
    } finally {
      if (fetchId === fetchCounter.current) {
        setLoading(false);
      }
    }
  }, [isSignedIn, isLoaded, userId, getToken, selectedVehicleId, defaultVehicleId]);

  useEffect(() => {
    const currentFetchId = ++fetchCounter.current;
    loadData(currentFetchId);
  }, [loadData]);

  const addRecord = async (record: Omit<FuelRecord, "id" | "vehicle_id">) => {
    const targetVehicleId = selectedVehicleId && !selectedVehicleId.startsWith("default-") ? selectedVehicleId : null;

    if (!isSignedIn) {
      const newRecord: FuelRecord = {
        ...record,
        id: Date.now().toString(),
        vehicle_id: targetVehicleId || "default-car",
        created_at: new Date().toISOString(),
      };
      
      const allSaved = typeof window !== "undefined" ? localStorage.getItem("fuel_lens_data") : null;
      let allRecords: FuelRecord[] = [];
      if (allSaved) {
        try { allRecords = JSON.parse(allSaved); } catch {}
      }
      
      const updatedAll = [newRecord, ...allRecords];
      if (typeof window !== "undefined") {
        localStorage.setItem("fuel_lens_data", JSON.stringify(updatedAll));
      }
      
      setRecords(prev => sortRecordsByDateDesc([newRecord, ...prev]));
      return newRecord;
    }

    const token = await getToken({ template: "supabase" });
    if (!token) throw new Error("認証トークンの取得に失敗しました");
    const supabase = createClerkSupabaseClient(token);

    const insertPayload: Record<string, unknown> = { ...record, user_id: userId };
    if (targetVehicleId) insertPayload.vehicle_id = targetVehicleId;

    const { data, error } = await supabase
      .from("fuel_records")
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      // vehicle_id カラムが存在しない環境でのみ、vehicle_id を外して再挿入する。
      // ネットワークエラーやRLS違反など他の原因でフォールバックすると、
      // 記録が意図しない「未分類（vehicle_id=null）」として保存されてしまうため限定する。
      const isMissingVehicleColumn =
        targetVehicleId != null &&
        (error.code === "42703" || /vehicle_id/i.test(error.message ?? ""));
      if (!isMissingVehicleColumn) throw error;

      const fallbackPayload = { ...record, user_id: userId };
      const fallbackRes = await supabase.from("fuel_records").insert(fallbackPayload).select().single();
      if (fallbackRes.error) throw fallbackRes.error;
      setRecords(prev => sortRecordsByDateDesc([fallbackRes.data as FuelRecord, ...prev]));
      return fallbackRes.data as FuelRecord;
    }

    setRecords(prev => sortRecordsByDateDesc([data as FuelRecord, ...prev]));
    return data as FuelRecord;
  };

  const updateRecord = async (id: string, updates: Partial<FuelRecord>) => {
    if (!isSignedIn) {
      // localStorageの更新（副作用はsetRecords外で実行）
      const allSaved = typeof window !== "undefined" ? localStorage.getItem("fuel_lens_data") : null;
      if (allSaved) {
        try {
          const all: FuelRecord[] = JSON.parse(allSaved);
          const mappedAll = all.map(r => r.id === id ? { ...r, ...updates } : r);
          localStorage.setItem("fuel_lens_data", JSON.stringify(mappedAll));
        } catch {}
      }

      setRecords(prev => {
        const updated = prev.map(r => r.id === id ? { ...r, ...updates } : r);
        const filtered = updated.filter(r => {
          if (!selectedVehicleId || selectedVehicleId.startsWith("default-")) {
            return !r.vehicle_id || r.vehicle_id.startsWith("default-");
          }
          return r.vehicle_id === selectedVehicleId;
        });
        return sortRecordsByDateDesc(filtered);
      });
      return;
    }

    const token = await getToken({ template: "supabase" });
    if (!token) throw new Error("認証トークンの取得に失敗しました");
    const supabase = createClerkSupabaseClient(token);
    const { error } = await supabase.from("fuel_records").update(updates).eq("id", id);
    if (error) throw error;

    setRecords(prev => {
      const updated = prev.map(r => r.id === id ? { ...r, ...updates } : r);
      const filtered = updated.filter(r => {
        if (!selectedVehicleId || selectedVehicleId.startsWith("default-")) {
          return !r.vehicle_id || r.vehicle_id.startsWith("default-");
        }
        return r.vehicle_id === selectedVehicleId;
      });
      return sortRecordsByDateDesc(filtered);
    });
  };

  const deleteRecord = async (id: string) => {
    if (!isSignedIn) {
      setRecords(prev => {
        const updated = prev.filter(r => r.id !== id);
        const allSaved = typeof window !== "undefined" ? localStorage.getItem("fuel_lens_data") : null;
        if (allSaved) {
          try {
            const all: FuelRecord[] = JSON.parse(allSaved);
            const filteredAll = all.filter(r => r.id !== id);
            localStorage.setItem("fuel_lens_data", JSON.stringify(filteredAll));
          } catch {}
        }
        return updated;
      });
      return;
    }

    const token = await getToken({ template: "supabase" });
    if (!token) throw new Error("認証トークンの取得に失敗しました");
    const supabase = createClerkSupabaseClient(token);
    const { error } = await supabase.from("fuel_records").delete().eq("id", id);
    if (error) throw error;

    setRecords(prev => prev.filter(r => r.id !== id));
  };

  const refresh = useCallback(() => {
    const currentFetchId = ++fetchCounter.current;
    return loadData(currentFetchId);
  }, [loadData]);

  return {
    records,
    loading,
    addRecord,
    updateRecord,
    deleteRecord,
    refresh
  };
}
