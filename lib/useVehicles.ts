import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import { createClerkSupabaseClient } from "./supabaseClient";

export type Vehicle = {
  id: string;
  user_id: string;
  name: string;
  type: "car" | "bike";
  created_at?: string;
};

const DEFAULT_VEHICLE: Vehicle = {
  id: "default-car",
  user_id: "local",
  name: "メインカー",
  type: "car",
};

const SELECTED_VEHICLE_KEY = "fuel_lens_selected_vehicle_id";
const LOCAL_VEHICLES_KEY = "fuel_lens_vehicles";

export function useVehicles() {
  const { getToken, userId, isSignedIn, isLoaded } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([DEFAULT_VEHICLE]);
  const [selectedVehicleId, setSelectedVehicleIdState] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(SELECTED_VEHICLE_KEY) || DEFAULT_VEHICLE.id;
    }
    return DEFAULT_VEHICLE.id;
  });
  const [loading, setLoading] = useState(true);
  const fetchCounter = useRef(0);

  const setSelectedVehicleId = useCallback((id: string) => {
    setSelectedVehicleIdState(id);
    if (typeof window !== "undefined") {
      localStorage.setItem(SELECTED_VEHICLE_KEY, id);
      window.dispatchEvent(new CustomEvent("vehicle_changed", { detail: { id } }));
    }
  }, []);

  const loadVehicles = useCallback(async (fetchId: number) => {
    if (!isLoaded) return;
    setLoading(true);

    const cachedSelectedId = typeof window !== "undefined" ? localStorage.getItem(SELECTED_VEHICLE_KEY) : null;

    if (!isSignedIn) {
      const localSaved = typeof window !== "undefined" ? localStorage.getItem(LOCAL_VEHICLES_KEY) : null;
      if (fetchId !== fetchCounter.current) return;
      let loadedVehicles = [DEFAULT_VEHICLE];
      if (localSaved) {
        try {
          const parsed = JSON.parse(localSaved);
          if (parsed && parsed.length > 0) loadedVehicles = parsed;
        } catch {}
      }
      setVehicles(loadedVehicles);
      setSelectedVehicleIdState(
        cachedSelectedId && loadedVehicles.some(v => v.id === cachedSelectedId)
          ? cachedSelectedId
          : loadedVehicles[0].id
      );
      setLoading(false);
      return;
    }

    try {
      const token = await getToken({ template: "supabase" });
      if (!token) throw new Error("認証トークンの取得に失敗しました");
      if (fetchId !== fetchCounter.current) return;
      const supabase = createClerkSupabaseClient(token);

      // ローカル車両データのマイグレーション
      const localData = typeof window !== "undefined" ? localStorage.getItem(LOCAL_VEHICLES_KEY) : null;
      if (localData) {
        try {
          const parsedLocal: Vehicle[] = JSON.parse(localData);
          const toInsert = parsedLocal
            .filter(v => v.id !== DEFAULT_VEHICLE.id)
            .map(v => ({ user_id: userId, name: v.name, type: v.type }));
          
          if (toInsert.length > 0) {
            const { error: insertError } = await supabase.from("vehicles").insert(toInsert);
            if (!insertError) {
              // 成功した場合のみローカルデータを削除
              localStorage.removeItem(LOCAL_VEHICLES_KEY);
            }
          } else {
            // デフォルト車両のみの場合はローカルデータを削除
            localStorage.removeItem(LOCAL_VEHICLES_KEY);
          }
        } catch (e) {
          console.error("車両データのマイグレーション失敗:", e);
          // エラー時はローカルデータを保持（次回再試行）
        }
      }

      // クラウドから車両一覧を取得
      const { data, error } = await supabase
        .from("vehicles")
        .select("*")
        .order("created_at", { ascending: true });

      if (fetchId !== fetchCounter.current) return;
      if (error) throw error;

      let fetchedVehicles = data as Vehicle[];

      // クラウドに車両がない場合はデフォルト車両を自動生成
      if (!fetchedVehicles || fetchedVehicles.length === 0) {
        const { data: insertedData, error: insertErr } = await supabase
          .from("vehicles")
          .insert({ user_id: userId, name: "メインカー", type: "car" })
          .select()
          .single();

        if (fetchId !== fetchCounter.current) return;

        if (!insertErr && insertedData) {
          fetchedVehicles = [insertedData as Vehicle];
        } else {
          fetchedVehicles = [DEFAULT_VEHICLE];
        }
      }

      setVehicles(fetchedVehicles);
      setSelectedVehicleIdState(
        cachedSelectedId && fetchedVehicles.some(v => v.id === cachedSelectedId)
          ? cachedSelectedId
          : fetchedVehicles[0].id
      );
    } catch (e) {
      console.error("車両データの読み込み失敗:", e);
      setVehicles([DEFAULT_VEHICLE]);
      setSelectedVehicleIdState(DEFAULT_VEHICLE.id);
    } finally {
      if (fetchId === fetchCounter.current) {
        setLoading(false);
      }
    }
  }, [isLoaded, isSignedIn, userId, getToken]);

  // 他コンポーネントでの選択変更イベントをリッスン
  useEffect(() => {
    const currentFetchId = ++fetchCounter.current;
    loadVehicles(currentFetchId);
  }, [loadVehicles]);

  useEffect(() => {
    const handleVehicleSync = (e: Event) => {
      const customEvent = e as CustomEvent<{ id: string }>;
      if (customEvent.detail?.id) {
        setSelectedVehicleIdState(customEvent.detail.id);
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("vehicle_changed", handleVehicleSync);
      return () => window.removeEventListener("vehicle_changed", handleVehicleSync);
    }
  }, []);

  const refreshVehicles = useCallback(() => {
    const currentFetchId = ++fetchCounter.current;
    return loadVehicles(currentFetchId);
  }, [loadVehicles]);

  const addVehicle = async (name: string, type: "car" | "bike") => {
    if (!isSignedIn) {
      const newVehicle: Vehicle = {
        id: `local-vehicle-${Date.now()}`,
        user_id: "local",
        name,
        type,
      };
      const updated = [...vehicles, newVehicle];
      setVehicles(updated);
      setSelectedVehicleId(newVehicle.id);
      if (typeof window !== "undefined") {
        localStorage.setItem(LOCAL_VEHICLES_KEY, JSON.stringify(updated));
      }
      return newVehicle;
    }

    const token = await getToken({ template: "supabase" });
    if (!token) throw new Error("認証トークンの取得に失敗しました");
    const supabase = createClerkSupabaseClient(token);
    const { data, error } = await supabase
      .from("vehicles")
      .insert({ user_id: userId, name, type })
      .select()
      .single();

    if (error) throw error;

    const added = data as Vehicle;
    setVehicles(prev => [...prev, added]);
    setSelectedVehicleId(added.id);
    return added;
  };

  const deleteVehicle = async (id: string) => {
    if (vehicles.length <= 1) {
      alert("最低1台の車両は残す必要があります。");
      return;
    }

    if (!isSignedIn) {
      const updated = vehicles.filter(v => v.id !== id);
      setVehicles(updated);
      const nextActiveId = selectedVehicleId === id ? updated[0].id : selectedVehicleId;
      if (selectedVehicleId === id) {
        setSelectedVehicleId(nextActiveId);
      }
      if (typeof window !== "undefined") {
        localStorage.setItem(LOCAL_VEHICLES_KEY, JSON.stringify(updated));
        
        // 関連するローカルの給油レコードも削除
        const localRecords = localStorage.getItem("fuel_lens_data");
        if (localRecords) {
          try {
            const parsedRecords = JSON.parse(localRecords);
            // 削除された車両に紐づくレコードを除外
            const filteredRecords = parsedRecords.filter((r: Record<string, unknown>) => r.vehicle_id !== id);
            localStorage.setItem("fuel_lens_data", JSON.stringify(filteredRecords));
          } catch (e) {
            console.error("ローカル給油レコードの削除失敗:", e);
          }
        }

        window.dispatchEvent(new CustomEvent("vehicle_changed", { detail: { id: nextActiveId } }));
      }
      return;
    }

    try {
      const token = await getToken({ template: "supabase" });
      if (!token) throw new Error("認証トークンの取得に失敗しました");
      const supabase = createClerkSupabaseClient(token);
      const { error } = await supabase.from("vehicles").delete().eq("id", id);
      if (error) throw error;

      const updated = vehicles.filter(v => v.id !== id);
      setVehicles(updated);
      const nextActiveId = selectedVehicleId === id ? updated[0].id : selectedVehicleId;
      if (selectedVehicleId === id) {
        setSelectedVehicleId(nextActiveId);
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("vehicle_changed", { detail: { id: nextActiveId } }));
      }
    } catch (e) {
      console.error("車両の削除失敗:", e);
      throw e;
    }
  };

  const updateVehicle = async (id: string, name: string, type: "car" | "bike") => {
    if (!isSignedIn) {
      const updated = vehicles.map(v => v.id === id ? { ...v, name, type } : v);
      setVehicles(updated);
      if (typeof window !== "undefined") {
        localStorage.setItem(LOCAL_VEHICLES_KEY, JSON.stringify(updated));
        window.dispatchEvent(new CustomEvent("vehicle_changed", { detail: { id: selectedVehicleId } }));
      }
      return;
    }

    try {
      const token = await getToken({ template: "supabase" });
      if (!token) throw new Error("認証トークンの取得に失敗しました");
      const supabase = createClerkSupabaseClient(token);
      const { error } = await supabase
        .from("vehicles")
        .update({ name, type })
        .eq("id", id);

      if (error) throw error;

      setVehicles(prev => prev.map(v => v.id === id ? { ...v, name, type } : v));
      
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("vehicle_changed", { detail: { id: selectedVehicleId } }));
      }
    } catch (e) {
      console.error("車両の更新失敗:", e);
      throw e;
    }
  };

  return {
    vehicles,
    selectedVehicleId,
    selectedVehicle: vehicles.find(v => v.id === selectedVehicleId) || vehicles[0],
    loading,
    setSelectedVehicleId,
    addVehicle,
    deleteVehicle,
    updateVehicle,
    refreshVehicles,
  };
}
