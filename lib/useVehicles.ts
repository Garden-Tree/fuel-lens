import { useState, useEffect, useCallback } from "react";
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
  const [selectedVehicleId, setSelectedVehicleIdState] = useState<string>(DEFAULT_VEHICLE.id);
  const [loading, setLoading] = useState(true);

  const setSelectedVehicleId = useCallback((id: string) => {
    setSelectedVehicleIdState(id);
    if (typeof window !== "undefined") {
      localStorage.setItem(SELECTED_VEHICLE_KEY, id);
      window.dispatchEvent(new CustomEvent("vehicle_changed", { detail: { id } }));
    }
  }, []);

  const loadVehicles = useCallback(async () => {
    if (!isLoaded) return;
    setLoading(true);

    const cachedSelectedId = typeof window !== "undefined" ? localStorage.getItem(SELECTED_VEHICLE_KEY) : null;

    if (!isSignedIn) {
      const localSaved = typeof window !== "undefined" ? localStorage.getItem(LOCAL_VEHICLES_KEY) : null;
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
      if (!token) throw new Error("Missing Supabase Token");
      const supabase = createClerkSupabaseClient(token);

      // ローカル車両データのマイグレーション
      const localData = typeof window !== "undefined" ? localStorage.getItem(LOCAL_VEHICLES_KEY) : null;
      if (localData) {
        localStorage.removeItem(LOCAL_VEHICLES_KEY);
        try {
          const parsedLocal: Vehicle[] = JSON.parse(localData);
          const toInsert = parsedLocal
            .filter(v => v.id !== DEFAULT_VEHICLE.id)
            .map(v => ({ user_id: userId, name: v.name, type: v.type }));
          
          if (toInsert.length > 0) {
            await supabase.from("vehicles").insert(toInsert);
          }
        } catch {}
      }

      // クラウドから車両一覧を取得
      const { data, error } = await supabase
        .from("vehicles")
        .select("*")
        .order("created_at", { ascending: true });

      if (error) throw error;

      let fetchedVehicles = data as Vehicle[];

      // クラウドに車両がない場合はデフォルト車両を自動生成
      if (!fetchedVehicles || fetchedVehicles.length === 0) {
        const { data: insertedData, error: insertErr } = await supabase
          .from("vehicles")
          .insert({ user_id: userId, name: "メインカー", type: "car" })
          .select()
          .single();

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
      setLoading(false);
    }
  }, [isLoaded, isSignedIn, userId, getToken]);

  // 他コンポーネントでの選択変更イベントをリッスン
  useEffect(() => {
    loadVehicles();
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
    const supabase = createClerkSupabaseClient(token!);
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
      if (selectedVehicleId === id) setSelectedVehicleId(updated[0].id);
      if (typeof window !== "undefined") {
        localStorage.setItem(LOCAL_VEHICLES_KEY, JSON.stringify(updated));
      }
      return;
    }

    try {
      const token = await getToken({ template: "supabase" });
      const supabase = createClerkSupabaseClient(token!);
      const { error } = await supabase.from("vehicles").delete().eq("id", id);
      if (error) throw error;

      const updated = vehicles.filter(v => v.id !== id);
      setVehicles(updated);
      if (selectedVehicleId === id) setSelectedVehicleId(updated[0].id);
    } catch (e) {
      console.error("車両の削除失敗:", e);
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
    refreshVehicles: loadVehicles,
  };
}
