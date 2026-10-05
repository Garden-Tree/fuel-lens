"use client";

import { useState } from "react";
import Link from "next/link";
import { SignedIn, SignedOut, SignInButton, UserButton, useAuth } from "@clerk/nextjs";
import { ArrowLeft, Settings } from "lucide-react";

import { useFuelRecords } from "@/lib/useFuelRecords";
import { useVehicles } from "@/lib/useVehicles";
import BackupPanel from "@/components/BackupPanel";
import ImportPanel from "@/components/ImportPanel";

export default function SettingsPage() {
  const { isSignedIn } = useAuth();
  const {
    vehicles,
    selectedVehicleId,
    addVehicles,
    loading: vehiclesLoading,
    error: vehiclesError,
    readOnly: vehiclesReadOnly,
  } = useVehicles();
  // 一覧表示はしないが、全件取得・一括追加と閲覧専用判定のためにフックを使う
  const {
    fetchAllRecords,
    addRecords,
    error: recordsError,
    readOnly: recordsReadOnly,
  } = useFuelRecords(selectedVehicleId, vehicles[0]?.id, { enabled: !vehiclesLoading });

  // インポート後に BackupPanel を作り直し、データ概要（記録数）を読み込み直す
  const [dataVersion, setDataVersion] = useState(0);

  const readOnly = vehiclesReadOnly || recordsReadOnly;
  const loadError = vehiclesError ?? recordsError;

  return (
    <main className="min-h-screen bg-black text-white p-4 md:p-8 pb-20 font-sans flex flex-col items-center">
      <div className="w-full max-w-3xl">
        <header className="flex items-center justify-between py-4 mb-2 sticky top-0 bg-black/80 backdrop-blur-md z-10 w-full">
          <div className="flex items-center gap-4">
            <Link href="/app" aria-label="ホームに戻る" className="p-2 bg-gray-900 rounded-full hover:bg-gray-800 transition">
              <ArrowLeft className="w-5 h-5 text-gray-300" aria-hidden="true" />
            </Link>
            <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
              <Settings className="w-6 h-6 text-blue-500" aria-hidden="true" /> 設定
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <SignedOut>
              <SignInButton forceRedirectUrl="/settings">
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

        {loadError && (
          <p role="alert" className="text-xs text-red-400 mb-3 px-1 break-words">{loadError}</p>
        )}
        {readOnly && (
          <p role="status" className="text-[11px] text-amber-400/90 mb-3 px-1">閲覧専用（クラウド接続待ち）</p>
        )}

        <BackupPanel
          key={dataVersion}
          vehicles={vehicles}
          loading={vehiclesLoading}
          isSignedIn={!!isSignedIn}
          readOnly={readOnly}
          vehiclesError={vehiclesError}
          fetchAllRecords={fetchAllRecords}
          addVehicles={addVehicles}
          addRecords={addRecords}
        />

        <div className="mt-6">
          <ImportPanel
            vehicles={vehicles}
            loading={vehiclesLoading}
            isSignedIn={!!isSignedIn}
            readOnly={readOnly}
            vehiclesError={vehiclesError}
            fetchAllRecords={fetchAllRecords}
            addVehicles={addVehicles}
            addRecords={addRecords}
            onImported={() => setDataVersion(v => v + 1)}
          />
        </div>
      </div>
    </main>
  );
}
