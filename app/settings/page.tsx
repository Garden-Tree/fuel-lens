"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@clerk/nextjs";

import { useVehicleScope } from "@/lib/useVehicleScope";
import { AppFrame, HookErrorLine, PageHeader, ReadOnlyCaption } from "@/components/AppShell";
import BackupPanel from "@/components/BackupPanel";
import ImportPanel from "@/components/ImportPanel";
import type { SettingsBusy } from "@/components/settingsUi";

export default function SettingsPage() {
  const { isSignedIn } = useAuth();
  // 一覧表示はしない（list: false）。車両と、全件取得・一括追加の操作だけ使う。
  // データ概要・全車両 CSV は fetchAllRecords が車両ごとの距離の入力方式で連鎖計算する
  const {
    vehicles,
    loading: vehiclesLoading,
    error: loadError,
    readOnly,
    vehicleActions: { addVehicles },
    recordActions: { fetchAllRecords, addRecords },
  } = useVehicleScope({ list: false });

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

  return (
    <AppFrame width="narrow">
      <div className="flex w-full flex-col gap-5">
        <PageHeader title="設定" />

        <HookErrorLine error={loadError} />
        <ReadOnlyCaption show={readOnly} />

        <BackupPanel
          refreshToken={dataVersion}
          onDone={handleRestoreDone}
          busy={busy}
          setBusy={setBusy}
          vehicles={vehicles}
          loading={vehiclesLoading}
          isSignedIn={!!isSignedIn}
          readOnly={readOnly}
          vehiclesError={loadError}
          fetchAllRecords={fetchAllRecords}
          addVehicles={addVehicles}
          addRecords={addRecords}
        />

        <ImportPanel
          vehicles={vehicles}
          loading={vehiclesLoading}
          isSignedIn={!!isSignedIn}
          readOnly={readOnly}
          vehiclesError={loadError}
          fetchAllRecords={fetchAllRecords}
          addVehicles={addVehicles}
          addRecords={addRecords}
          onDone={handleRestoreDone}
          busy={busy}
          setBusy={setBusy}
        />
      </div>
    </AppFrame>
  );
}
