"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { SignedIn, SignedOut, SignInButton, UserButton, useAuth } from "@clerk/nextjs";
import { ArrowLeft, Settings } from "lucide-react";

import { useFuelRecords } from "@/lib/useFuelRecords";
import { useVehicles } from "@/lib/useVehicles";
import BackupPanel from "@/components/BackupPanel";
import ImportPanel from "@/components/ImportPanel";
import type { SettingsBusy } from "@/components/settingsUi";

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
  // 一覧表示はしないが、全件取得・一括追加のためにフックを使う。
  // vehicles を渡し、fetchAllRecords（全車両 CSV・データ概要）が車両ごとの距離の入力方式で連鎖計算するようにする
  const {
    fetchAllRecords,
    addRecords,
    error: recordsError,
  } = useFuelRecords(selectedVehicleId, vehicles[0]?.id, { enabled: !vehiclesLoading, vehicles });

  // 復元・インポートの後に BackupPanel のデータ概要（記録数）を読み込み直す。
  // key で作り直すと処理中の復元がアンマウントされるため、refreshToken で再取得だけさせる
  const [dataVersion, setDataVersion] = useState(0);
  // バックアップ・復元・取り込みを同時に動かさないよう、処理中フラグを 2 つのパネルで共有する
  const [busy, setBusy] = useState<SettingsBusy | null>(null);
  // 復元・取り込みの後（成功・失敗とも）に両パネルから呼ばれる。書き込みを行ったとき（changed。
  // 失敗でも途中まで追加済みの可能性がある）だけ記録数を読み込み直す。何も追加しなかったときは読み直さない
  const handleRestoreDone = useCallback((changed: boolean) => {
    if (changed) setDataVersion(v => v + 1);
  }, []);

  // 閲覧専用（ログイン中かつクラウド障害中）。useVehicles と useFuelRecords の readOnly は同じ障害状態から決まるので片方だけ使う
  const readOnly = vehiclesReadOnly;
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
          refreshToken={dataVersion}
          onDone={handleRestoreDone}
          busy={busy}
          setBusy={setBusy}
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
            onDone={handleRestoreDone}
            busy={busy}
            setBusy={setBusy}
          />
        </div>
      </div>
    </main>
  );
}
