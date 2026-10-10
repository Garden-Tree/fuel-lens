# アーキテクチャ

FuelLens の構成、データの流れ、主要なモジュールの役割をまとめます。
デプロイ・運用は [operations.md](./operations.md)、AI 解析 API は [api-analyze.md](./api-analyze.md) を参照してください。

## 1. ディレクトリ構成

| パス | 役割 |
|---|---|
| `app/page.tsx` | ランディングページ（Server Component）。対話部分は `components/landing/*` |
| `app/app/page.tsx`、`app/app/_components/` | メイン画面。スキャン（画像の選択・ドロップ・貼り付け）、手動入力、最新記録の確認・編集。ページはフックと部品を組み合わせるだけで、部品は `_components/`（`ScanPanel` / `LatestRecordCard` / `ManualEntryCard` / `RecordCardSkeleton` / `HistoryLinkCard` / `ShortcutActionHandler`）に分割（[メイン画面の構成](#メイン画面の構成app)） |
| `app/history/page.tsx` | 履歴一覧。編集・削除・別車両への移動・年月フィルタ・並べ替え・CSV 出力 |
| `app/stats/page.tsx`、`app/stats/_components/` | 統計サマリーとグラフ（recharts）。ページは車両・期間の状態と `buildStatsModel` の結果を部品に渡すだけで、部品は `_components/` に分割。燃費・支払総額・単価の推移とスタンド別の単価。期間フィルタ（全期間 / 1 年 / 6 ヶ月 / 3 ヶ月）（[11 章](#11-統計)） |
| `app/settings/page.tsx` | 設定画面（`/settings`）。データ概要とバックアップ・復元（[8 章](#8-バックアップと復元)） |
| `app/manifest.ts` | PWA の Web App Manifest（`/manifest.webmanifest`。[9 章](#9-pwa)） |
| `app/api/analyze/route.ts` | Gemini で画像を解析する API（[api-analyze.md](./api-analyze.md)） |
| `app/api/keepalive/route.ts` | Supabase 自動停止対策のエンドポイント（[operations.md](./operations.md#3-supabase-の自動停止と-keepalive)） |
| `app/layout.tsx` | `ClerkProvider` / `ToastProvider` / `UserSync` / `SupabaseStatusBanner`、`metadata` と `viewport` |
| `app/error.tsx` / `app/global-error.tsx` / `app/not-found.tsx` | エラー画面・404 |
| `components/ScanReviewSheet.tsx` | スキャン結果の確認シート（保存前に確認・修正する） |
| `components/EditFuelRecordForm.tsx` | 記録の入力フォーム（手動入力・編集・確認シートで共用） |
| `components/RecordStats.tsx` | 記録カードの明細（給油量・走行距離 / 区間距離・ODO・スタンド・メモ。`compact` はバッジも）。`variant="card"` は /app の最新記録カード、`variant="compact"` は /history のカード |
| `components/ManageVehiclesModal.tsx` / `components/VehicleSelector.tsx` | 車両の管理モーダル / 車両の切り替え |
| `components/Modal.tsx` | 共通モーダル。`useFocusTrap` + `useBackdropClose` + Escape + 任意の本文スクロールロックを束ね、`role="dialog"` / `aria-modal` / `aria-labelledby` を付ける。保存中は `disableClose` で Escape・背景クリック・× を無視。`Modal.Header`（見出しと ×）/ `Modal.Body` / `Modal.Footer`、Escape だけ別処理にする `onEscape` |
| `components/vehicles/*` / `lib/useVehicleDraft.ts` | 車両の管理モーダルの部品。`VehicleRow`（表示 / 編集行、削除確認文 `deleteConfirmMessage`）、`AddVehicleForm`、`VehicleSettingsFields`（距離の入力方式・既定の燃料種別・車両タイプの切り替え、`modeSwitchNote`）。追加フォーム・編集行の下書きと検証は `useVehicleDraft` |
| `components/BackupPanel.tsx` | 設定画面の本体。データ概要、JSON / CSV の書き出し、復元（ファイル選択 → 件数プレビュー → 確認 → 追加） |
| `components/ImportPanel.tsx` | 設定画面の「インポート」。Fuelio / FuelLens の CSV を読み込み、復元と同じ流れで追加する（[8 章](#インポートcsv)） |
| `components/RestoreCounts.tsx` / `components/settingsUi.ts` | 復元・取り込みの件数プレビュー（と補足の箇条書き） / 設定画面の 2 パネルで共有するクラス名と処理中フラグの型（`SettingsBusy`） |
| `components/Toast.tsx` | `ToastProvider` と `useToast()`（通知と確認ダイアログ） |
| `components/UserSync.tsx` | ログイン中のユーザーを `users` テーブルへ upsert |
| `components/SupabaseStatusBanner.tsx` | クラウド障害時の警告バナーと「再試行」 |
| `lib/types.ts` | ドメインの型と定数（`FuelRecord` / `Vehicle` / `VehicleSettings` / `VehicleType` / `FuelType` / `FUEL_TYPES` / `FUEL_TYPE_LABELS` / `DistanceMode` / `RecordInput` / `NewRecordField`）。import なし。フックのファイル（`useFuelRecords` / `useVehicles` / `useRecordForm`）は互換のため再エクスポートしている（`@deprecated`） |
| `lib/dates.ts` | 日付・日時の検証と変換（`isValidCalendarDate` / `normalizeDateString` / `parseLocalDate` / `localDateString` / `todayLocalISO` / `subtractMonthsClamped` / `normalizeTimestamp`）。import なしの純粋関数 |
| `lib/events.ts` | アプリ内の window イベント。`FUEL_RECORDS_CHANGED_EVENT` と `notifyRecordsChanged()`、購読フック `useWindowEvent(name, handler)` |
| `lib/vehicleSelection.ts` | 選択中の車両の決定（`pickSelected` / `shouldPersistSelection`）と保存キー（`selectedVehicleStorageKey`）。純粋関数 |
| `lib/analyze.ts` | `/api/analyze` の純粋ヘルパーと型。import するのは依存のないドメインモジュール（`lib/types.ts` / `lib/dates.ts` / `lib/calculations.ts`）だけ |
| `lib/calculations.ts` | `calculateFuelMetrics`（燃費・単価の計算） |
| `lib/fillChain.ts` | 給油の連鎖計算 `applyFillChain`（オドメーターの差分・部分給油の合算・記録漏れでの連鎖切断）と、燃料種別・距離の入力方式の判定・既定値補完（`normalizeRecord` / `normalizeVehicle`）、フォームのプレビュー（`previewInChain`）。純粋関数（[10 章](#10-給油の連鎖計算fill-chain)） |
| `lib/stats/` | 統計ページの純粋な集計ロジック。`period` / `summary` / `series` / `prices` / `stationRows` / `model` に分割し、`index.ts` から再エクスポート（`@/lib/stats`）（[11 章](#11-統計)） |
| `lib/stations.ts` | スタンド名の正規化（`normalizeStationName`）、ブランド判定（`detectBrand` と辞書 `STATION_BRANDS`）、グルーピングキー（`stationKey`）。純粋関数 |
| `lib/recordFilters.ts` | 車両・未分類の判定と、記録一覧の並び順（`sortRecordsByDateDesc`。日付の無い・不正な記録は最後）。純粋関数 |
| `lib/backup.ts` | バックアップ JSON の組み立て・検証（`parseBackup`）・復元計画（`planRestore` / `finalizeRestoreRecords`）。純粋関数 |
| `lib/restore.ts` / `lib/useRestoreRunner.ts` | 復元・取り込みの実行手順 `executeRestore`（データ操作は引数で受け取る。node でテスト可能）と、それを設定画面の UI（処理中フラグ・進捗・toast）につなぐフック（[8 章](#実行の共通化)） |
| `lib/csv.ts` | CSV の組み立て・エスケープ・ダウンロード。履歴画面の CSV 出力と設定画面の全車両 CSV で共有 |
| `lib/importers/fuelio.ts` / `lib/importers/fuellensCsv.ts` | CSV の取り込み（Fuelio / FuelLens の CSV → バックアップ形式）。純粋関数 |
| `lib/useVehicles.ts` / `lib/useFuelRecords.ts` / `lib/useRecordForm.ts` | データフックとフォーム状態（[4 章](#4-フック-api)）。フォームの純粋なヘルパーは `lib/recordDraft.ts` |
| `lib/useBackdropClose.ts` | モーダルの背景クリックで閉じるハンドラ（ドラッグでの誤閉じを防ぐ） |
| `lib/data/` | データアダプタ層（[2 章](#データアダプタ層libdata)）。`types.ts`（`RecordStore` / `VehicleStore` / `DataError`）、`localStore.ts`（localStorage の実装と `LOCAL_*` キー・`writeLocalJson`）、`cloudStore.ts`（Supabase の実装と `ensureDefaultVehicle` / `ensureUserRow` / `withStatus`）、`withOutage.ts`（`withOutageHandling` / `withCache`）、`cloudBootstrap.ts`（移行 → 既定車両の確保をタブ内で 1 回）、`primedVehicles.ts`（取得済みの車両一覧を最初の `list()` に 1 回だけ返す）、`useDataStores.ts`（ログイン状態でストアを選ぶフック）、`columns.ts` / `scope.ts`（列の検証・パッチ、一覧の範囲。純粋関数） |
| `lib/migrateLocalData.ts` | ローカル → クラウドの移行（[5 章](#5-ローカル--クラウド移行)）。`LOCAL_*` / `writeLocalJson` / `CrossTabLockError` は互換のため再エクスポート |
| `lib/crossTabLock.ts` | ユーザー単位のクロスタブ排他ロック `withCrossTabLock`（Web Locks + localStorage リース）と `CrossTabLockError` |
| `lib/supabaseClient.ts` | ユーザーごとの Supabase クライアント（Clerk JWT 付き） |
| `lib/supabaseHealth.ts` | 障害の分類、閲覧専用モード、キャッシュ、再試行（[6 章](#6-障害時の動作)） |
| `lib/supabase/errors.ts` / `outage.ts` / `retry.ts` / `cache.ts` | `supabaseHealth.ts` の実体。errors = 失敗の分類とエラーメッセージ（純粋関数。`migrateLocalData.ts` は `lib/supabase/` のうちここだけを import）、outage = 障害状態の記録・通知・`useSupabaseOutage`、retry = 再試行イベントと自動再試行、cache = per-user キャッシュ。`supabaseHealth.ts` は互換用の再エクスポート |
| `lib/format.ts` | 表示用の純粋フォーマット（`efficiencyNullReason` / `formatOdometer` / `formatKm`） |
| `lib/importers/csvParse.ts` | CSV 取り込みの共有プリミティブ（`parseCsvRows` / `parseCsvNumber` / `parseFlexibleDate` / `hashString` / `isBlankRow`）。`fuelio.ts` は互換のため再エクスポート |
| `lib/scan/` | メイン画面のスキャン。`analyzeClient.ts`（`compressToDataUrl` / `requestAnalyze`。React に依存しない I/O）、`shortcuts.ts`（`?action=` の判定 `resolveShortcutAction` / `shortcutReadinessOf`。純粋関数）、フック `useScanPipeline` / `useImageDropPaste` / `useShortcutActions`（[メイン画面の構成](#メイン画面の構成app)） |
| `lib/useRecordEditing.ts` | 記録の編集・手動入力のフォームの開閉と保存（重複確認・toast・車両切り替えで閉じる）。/app と /history で共用 |
| `lib/shareInbox.ts` | Web Share Target の受け取り箱。Service Worker が IndexedDB に置いた共有画像を、トークン一致かつ 10 分以内のときだけ取り出して削除する（`takeSharedImage` / `clearSharedImage`。[9 章](#9-pwa)） |
| `public/sw.js` | Service Worker。Web Share Target（POST `/share`）の受け取り専用で、キャッシュはしない（[9 章](#9-pwa)） |
| `components/ServiceWorkerRegister.tsx` | `public/sw.js` を登録する（本番ビルドのみ。開発中は `NEXT_PUBLIC_ENABLE_SW=1` で有効化）。`app/layout.tsx` にマウント |
| `public/icons/` / `public/apple-touch-icon.png` | PWA アイコン（`icon-192.png` / `icon-512.png` / `icon-maskable-512.png` と 180x180 の apple-touch-icon）。`scripts/generate-icons.mjs` が生成 |
| `scripts/generate-icons.mjs` | `app/icon.svg` から PWA アイコンを生成するスクリプト（`node scripts/generate-icons.mjs`） |
| `tests/*.test.ts`、`tests/data/*.test.ts` | Vitest の単体テスト（`node` プロジェクト、`environment: "node"`。対象は `lib/` の関数。`tests/data/` はデータアダプタ層で、偽の Supabase クライアントと Map の Storage は `tests/data/fakeSupabase.ts`） |
| `tests/components/*.test.tsx`、`tests/setup/` | Vitest のコンポーネントテスト（`dom` プロジェクト、jsdom + Testing Library。セットアップは `tests/setup/dom.ts`） |
| `supabase/migrations/*.sql` | スキーマ・RLS・keepalive・給油の連鎖計算用の列（`0004_fill_chain.sql`）（冪等）。手順は [supabase/README.md](../supabase/README.md) |
| `docs/` | このドキュメント群。連鎖計算の仕様は [design-fill-chain.md](./design-fill-chain.md) |
| `.github/workflows/` | `ci.yml`（CI）と `supabase-keepalive.yml`（keepalive の予備経路） |
| `proxy.ts` | Clerk ミドルウェア。Next.js 16 ではファイル名が `proxy.ts`。全ルートを公開のままにしている |
| `vercel.json` | Vercel Cron の定義 |
| `next.config.ts` | `agentRules: false`（`next dev` による CLAUDE.md の自動生成を無効化） |
| `csv/` | 個人の給油記録・DB バックアップ置き場（`.gitignore` 済み。コミットしない） |

## 2. データフロー

保存先はログイン状態で切り替わります。データを更新する処理は必ず両方の経路を実装します
（`lib/data/` の `RecordStore` / `VehicleStore` に操作を足し、local と cloud の両実装を書く。下の[データアダプタ層](#データアダプタ層libdata)）。

| 状態 | 保存先 | 備考 |
|---|---|---|
| 未ログイン | ブラウザの localStorage（`fuel_lens_vehicles` / `fuel_lens_data`） | その端末・ブラウザのみ。AI 解析は使えない（`ALLOW_ANONYMOUS_SCAN=true` の場合を除く） |
| ログイン中 | Supabase（ブラウザから anon キー + Clerk JWT で PostgREST に直接アクセス） | RLS で自分の行だけに制限。正常に読めた一覧は障害時用に localStorage へキャッシュ |

- 未ログインでも画面は表示・操作できます（`proxy.ts` は全ルートを公開のままにしている）。
  AI 解析だけは `/api/analyze` がログインを要求します。
- ログインすると、`useVehicles` / `useFuelRecords` の最初の読み込みの前にクラウドの初期化（`lib/data/cloudBootstrap.ts`）が走り、
  `migrateLocalData` でローカルの記録をクラウドへ移してから既定車両を確保します（[5 章](#5-ローカル--クラウド移行)）。
- スキャンの流れ: 画像を 0.8MB 以下・長辺 1200px の JPEG に圧縮 → `POST /api/analyze` → 確認シートで確認・修正 →
  同じ日付・給油量・支払総額の記録があれば確認ダイアログ → `addRecord`。解析結果を自動保存することはありません。
- 選択中の車両 ID は localStorage に保存します。未ログイン時は `fuel_lens_selected_vehicle_id`、ログイン時はユーザーごとの `fuel_lens_selected_vehicle_id_<userId>` を使い、保存値が現在の車両一覧に無い場合は既定車両へフォールバックして保存値を書き換えます。

### データアダプタ層（`lib/data/`）

フック（`useVehicles` / `useFuelRecords`）は保存先ごとの処理を持たず、ストアを選んで呼び、状態（`loading` / `error` / 一覧）・楽観更新・連鎖計算・イベント・選択の保存だけを受け持ちます。

```
useVehicles / useFuelRecords
  └ useDataStores()  … 未ログイン: createLocalStores()（localStorage）
                       ログイン:   withCache(withOutageHandling(createCloudStores(supabase, userId)))
                                   + bootstrap（cloudBootstrap: 移行 → 既定車両。タブ内で 1 回）
```

| モジュール | 役割 |
|---|---|
| `types.ts` | `RecordStore`（`list(scope)` / `listAll()` / `add` / `addMany(inputs, onProgress?)` / `update` / `remove` / `removeByVehicle(vehicleId, { includeUnclassified })`）と `VehicleStore`（`list` / `add` / `addMany` / `update` / `remove`）。`RecordScope = { vehicleId, includeUnclassified }`。エラーの型 `DataError`（日本語の `message`、`status` / `code` / `outage`、一括追加の途中失敗では `done` / `created`）と、生の層が一括追加の途中失敗を知らせる `PartialWriteError` |
| `localStore.ts` | `createLocalStores(storage?)`。キー `fuel_lens_data` / `fuel_lens_vehicles`、ID（記録 `Date.now()`、復元 `restored-<時刻36進>-<連番>`、車両 `local-vehicle-<時刻>`）、車両が無ければ `default-car`、未分類の保存先は `default-car`、既定車両の削除で未分類も削除。保存失敗は日本語の Error（`writeLocalJson`） |
| `cloudStore.ts` | `createCloudStores(supabase, userId)`。生の層で、失敗は `status` 付きの Supabase エラーをそのまま投げる（保存前の検証だけ日本語の `DataError`）。クエリの詳細は下 |
| `withOutage.ts` | `withOutageHandling(store, { isReadOnly, onFailure, onRecover })`: 分類 → `setOutage` → 日本語の `DataError` への変換と、書き込み前の閲覧専用ガードを 1 か所で行う（`list` の成功で `clearOutage`）。`withCache(store, { key })`: `list` の成功でキャッシュを書き、成功した書き込みも反映する。読み込み失敗時はフックが `cached()` で最後に同期した一覧を表示する |
| `cloudBootstrap.ts` | `bootstrapCloud(supabase, userId, deps?, { force? })`: `migrateLocalData` → `ensureDefaultVehicle` を userId ごとにタブ内で 1 回（[5 章](#5-ローカル--クラウド移行)）。結果は取得済みの車両一覧（`vehicles`）を運び、直後の最初の `vehicles.list()` はそれを使い回す（2 回目の GET を発行しない。`primedVehicles.ts`） |
| `useDataStores.ts` | ログイン状態に応じたストア（クラウドは userId・getToken ごとにメモ化）。フックのアンマウント・ユーザー切り替え後に届いた応答ではキャッシュを書かない |
| `columns.ts` / `scope.ts` | `pickRecordColumns`（保存する列のホワイトリストと検証）、`sanitizeVehicleSettings`、`applyRecordPatch` / `applyVehiclePatch`、`recordScopeOf` / `matchesRecordScope`（`matchesSelectedVehicle` と同じ判定） |

クラウドのクエリ（`cloudStore.ts`）:

- 記録の一覧: `fuel_records` を `date` の降順で取得し、`vehicle_id.eq.<uuid>`、既定車両なら `.or(vehicle_id.eq.<uuid>,vehicle_id.is.null)`（UUID を検証してから埋め込む。UUID でなければクエリを発行せず、日本語の検証エラー `DataError`（`VALIDATION_CODE`）を投げる。`[]` を返すと「読み込み成功」として障害の解除と空のキャッシュ書き込みが起きるため。フックは事前に `isUuid` で確認する）。
- 全件（`listAll`）: `user_id` で絞り、`date` 降順 → `id` 昇順で 1,000 件ずつ、空のページが返るまで読む（max-rows が小さくても欠けない）。
- 追加: `pickRecordColumns` の列だけを `user_id` / `vehicle_id` 付きで insert（`created_at` は DB の既定値）。一括追加は 100 件ずつ `defaultToNull: false` で、`created_at` を全行に正規化して送る。
- 車両: 一覧は `created_at` → `id` の昇順（1 台も無ければ「メインカー」を作成）。一括追加は 1 台ずつ入力順に `.select().single()`。
- 車両の削除: フックが `removeVehicleWithRecords`（`localStore.ts`）で、記録 → 車両の順に削除する（既定車両なら `vehicle_id` が null の記録も）。途中で失敗しても車両が残るので再試行で続きから消せる。未ログインだけは逆順（下の `deleteVehicle`）。

両ストアの戻り値は型注釈（`DataStores`）で `RecordStore` / `VehicleStore` を満たすことを確認しているので、片方の経路だけに操作を足すと typecheck が失敗します。

## 3. データモデル

定義は `supabase/migrations/0001_schema_and_rls.sql` にあり、連鎖計算用の列は `0004_fill_chain.sql` で追加しています。

| テーブル | 主な列 | 備考 |
|---|---|---|
| `users` | `id`（text、Clerk userId）, `email`（null 可）, `updated_at` | Clerk ユーザーのミラー。`UserSync` が upsert する |
| `vehicles` | `id`（uuid）, `user_id`, `name`, `type`（`car` / `bike`）, `created_at`, `distance_mode`, `default_fuel_type` | `type` は CHECK 制約。`distance_mode` / `default_fuel_type` は `0004` で追加（下表） |
| `fuel_records` | `id`（uuid）, `user_id`, `vehicle_id`（uuid、null 可）, `date`, `total_distance`, `fuel_amount`, `total_cost`, `price_per_unit`, `fuel_efficiency`, `gas_station`, `created_at`, `odometer`, `is_full`, `missed_previous`, `fuel_type`, `memo` | `total_distance` は区間距離（トリップモードは入力値、オドメーターモードは導出値）。後ろの 5 列は `0004` で追加（下表） |
| `keepalive` | `id`（常に 1）, `last_ping`, `source` | 自動停止対策のハートビート（`0002`）。アプリからは触らない |

`0004` で追加した列（すべて冪等な `add column if not exists`。既存行は書き換えず、既定値として読まれる）:

| テーブル | 列 | 型 | 既定 | 意味 |
|---|---|---|---|---|
| `fuel_records` | `odometer` | numeric null | null | 給油時の積算距離（km）。オドメーターモードの新規手動入力では必須。編集・スキャン保存では未入力可（持ち越し行になる） |
| `fuel_records` | `is_full` | boolean | `true` | 満タン給油か。`false` は部分給油 |
| `fuel_records` | `missed_previous` | boolean | `false` | この給油の前に記録し忘れた給油がある。`true` なら連鎖を切る |
| `fuel_records` | `fuel_type` | text null | null | `regular` / `premium` / `diesel` / `other`。null は未指定 |
| `fuel_records` | `memo` | text null | null | 自由記述（200 文字まで） |
| `vehicles` | `distance_mode` | text | `'trip'` | `trip`（トリップメーターの区間距離を入力）/ `odometer`（積算距離を入力し差分で区間を出す） |
| `vehicles` | `default_fuel_type` | text null | null | 新規記録の燃料種別の初期値 |

- `fuel_type` / `memo` の長さ / `distance_mode` / `default_fuel_type` は CHECK 制約です（`NOT VALID` で追加するので、新規行・更新行のみ検証）。
  `0004` を適用する前の DB に新しい列を送ると PostgREST が「列が無い」エラー（PGRST204）を返すため、アプリより先に適用します。
  アプリは読み込んだ行の新しい列を既定値で補います（`normalizeRecord` / `normalizeVehicle`）。
- `total_distance`（オドメーターモード）と `fuel_efficiency` の保存値は信頼しません。読み取り時に必ず再計算して上書きします（[10 章](#10-給油の連鎖計算fill-chain)）。
- 外部キーはすべて `ON DELETE CASCADE` です（`fuel_records.vehicle_id` → `vehicles`、`vehicles.user_id` / `fuel_records.user_id` → `users`）。
- `fuel_efficiency` と `price_per_unit` は、保存時にクライアントが `calculateFuelMetrics` で計算した値です
  （燃費は小数第 2 位、単価は 0.1 円/L 単位に丸める）。表示する燃費は読み取り時の連鎖計算の結果です（保存値は参考）。単価の表示は `formatPricePerUnit` で常に小数第 1 位まで出す（旧仕様の整数値も `160.0` と表示）。

### 既定車両と未分類

- **既定車両** は車両一覧の先頭（`vehicles[0]`）です。クラウドでは `created_at` が最も古い車両
  （`created_at` → `id` の昇順で取得）、ローカルでは配列の先頭（通常は `default-car`）です。
  ログイン時に車両が 1 台もなければ「メインカー」を自動作成します（`ensureDefaultVehicle`）。
- **未分類** の記録は、`vehicle_id` が `null`・空文字・ローカル既定車両（`default-*`）のものです（`isUnclassifiedRecord`）。
  既存 DB で存在しない車両を指していた記録は、`0001` が `null` に更新しています。
- 未分類の記録は **既定車両を選択しているときだけ** 表示・集計します（`matchesSelectedVehicle`）。
  常に表示すると、車両が複数あるとき全車両で重複表示・重複集計されるためです。
- ログイン中は `vehicle_id: null` で保存しません（選択中の車両 ID が UUID でなければ `addRecord` は日本語エラーを投げる）。
- 車両を削除すると、その車両の記録も削除します（アプリ側で先に削除し、DB 側も `ON DELETE CASCADE`）。
  既定車両を削除するときは、そこに表示されている未分類の記録も削除します。最後の 1 台は削除できません。

## 4. フック API

### `useVehicles()`（`lib/useVehicles.ts`）

戻り値: `vehicles`, `selectedVehicleId`, `loading`, `error`, `outage`, `readOnly`, `setSelectedVehicleId`,
`addVehicle(name, type, settings?)`, `addVehicles(items)`, `updateVehicle(id, name, type, settings?)`, `deleteVehicle(id)`, `refreshVehicles()`。

- ログイン中は一覧を読む前にクラウドの初期化（`migrateLocalData` → `ensureDefaultVehicle`。タブ内で userId ごとに 1 回）を待ちます。
  一覧は `VehicleStore.list()`（1 台も無ければ既定車両を作成）です。初期化の結果が取得済みの車両一覧を運ぶので、その直後の最初の `list()` は再取得せず使い回します（`lib/data/primedVehicles.ts`）。
- 読み込みに失敗したときはローカルの既定車両へフォールバックせず、最後に同期した一覧（キャッシュ）を表示します。
- `settings` は `VehicleSettings`（`{ distance_mode?, default_fuel_type? }`）。省略したキーは、追加ではトリップ / 未指定、更新では変更なしです。
  不明な値は `sanitizeVehicleSettings` が捨てます。更新は名前・種別・設定を 1 回の update で保存します。方式の切り替えでは、オドメーター → トリップのときだけ、先にその車両の記録の `total_distance` へ連鎖計算の区間距離を書き戻します（`planDistanceWriteBack`。[design-fill-chain.md 4 章](./design-fill-chain.md#車両管理モーダル)）。それ以外の切り替えでは記録を変更せず、表示は読み取り時に再計算されます。
- 読み込んだ車両（ローカル・クラウド・キャッシュ）は `normalizeVehicle` で新しい列を補います（`0004` 適用前の DB でも動く）。
- `addVehicles(items: ({ name, type } & VehicleSettings)[])`（復元用）は車両をまとめて追加し、作成した `Vehicle[]` を返します。
  未ログインでは `local-vehicle-<時刻>-<連番>` の ID でローカルに追加し、ログイン中は 1 台ずつ入力順に insert します（閲覧専用中は日本語エラー。途中で失敗しても作成済みの車両は一覧に反映）。
- `deleteVehicle` は `removeVehicleWithRecords` で `RecordStore.removeByVehicle`（既定車両なら未分類の記録も）と `VehicleStore.remove` を呼び、`fuel_records_changed` を発火します。
  順序は保存先で異なります: ログイン中は記録 → 車両。未ログインは縮めた車両の一覧を先に書き（容量超過なら何も変わらず、記録も残る）、その後に記録を削除します（記録の削除に失敗しても車両の削除は続け、console にだけ出す）。
- 未ログイン時の localStorage への保存（`addVehicle` / `updateVehicle` / `deleteVehicle`）は、画面の一覧を変える前に `writeLocalJson`（`lib/data/localStore.ts`）で行います。
  容量超過などで保存できなければ「ブラウザの保存領域がいっぱいです。…」の日本語エラーを投げ、一覧は変えません（英語の `DOMException` は console にだけ出す）。
- 選択中の車両は `lib/vehicleSelection.ts` の `pickSelected`（保存値が一覧に無ければ先頭の車両）で決め、ずれたときだけ保存し直します。

### `useFuelRecords(selectedVehicleId?, defaultVehicleId?, { enabled?, vehicles? })`（`lib/useFuelRecords.ts`）

戻り値: `records`（日付の降順）, `loading`, `error`, `outage`, `readOnly`, `addRecord`, `addRecords(items, { onProgress })`, `updateRecord`, `deleteRecord`, `fetchAllRecords()`, `refresh()`。

- 呼び出し側は `defaultVehicleId` に `vehicles[0]?.id`、`enabled` に `!vehiclesLoading`、`vehicles` に `useVehicles` の `vehicles` を渡します。
  `vehicles` は連鎖計算で各車両の `distance_mode` を知るために使い、省略時と一覧に無い車両はトリップモードとして扱います。
- `records` は保存値ではなく、`applyFillChain` を適用した導出値です。内部では保存値（新しい列は既定値で補完済み）を state に持ち、描画時に選択中の車両の方式で連鎖計算します。
  追加・更新・削除で隣の記録の燃費が変わっても、車両の方式を切り替えても即座に反映されます（[10 章](#10-給油の連鎖計算fill-chain)）。
- `addRecord` / `updateRecord` / `addRecords` は `pickRecordColumns` で既知の列だけを保存し、新しい列を検証します
  （`odometer` は 0 以上の有限数、`fuel_type` は 4 値、`memo` は 200 文字まで、`is_full` / `missed_previous` は真偽値のみ）。新しい列を省略した保存は DB の既定値になり、`0004` 適用前の DB でも成功します。
- ログイン中は `selectedVehicleId` が UUID になるまでクエリを発行しません。一覧を読む前にクラウドの初期化（`useVehicles` と共有。通常は完了済み）を待ちます。
- 保存先は `useDataStores()` が選ぶストアです（[2 章](#データアダプタ層libdata)）。読み込みの範囲は `recordScopeOf(selectedVehicleId, defaultVehicleId)`、追加・更新後の絞り込みは `matchesRecordScope` です。
- 車両削除などで記録が別経路から変わると、`fuel_records_changed` イベント（`lib/events.ts` の `notifyRecordsChanged()` が発火し、`useWindowEvent` で購読）で再読み込みします。
- `records` の並びは `sortRecordsByDateDesc`（日付の降順、同じ日付は id の降順。日付の無い・不正な記録は最後）です。
- 未ログイン時の `addRecord` / `updateRecord` / `deleteRecord` は、localStorage へ保存できなければ（容量超過など）
  「ブラウザの保存領域がいっぱいです。不要な記録を削除するかバックアップしてください。」の日本語エラーを投げます（`writeLocalJson`）。
- `addRecords(items, { onProgress })`（復元用）は、選択中の車両で絞らず、各記録の `vehicle_id` のまま一括追加して追加件数を返します。
  未ログインでは `restored-<時刻>-<連番>` の ID でローカルに追記します。ログイン中は 100 件ずつ挿入し、
  `vehicle_id` が UUID でない記録があれば挿入前に日本語エラーを投げます。途中で失敗したときは
  「N 件を追加したところで中断しました。」を先頭に付けたメッセージを投げます（追加済みの分は残る）。完了後に `fuel_records_changed` を発火します。
- `fetchAllRecords()` は全車両の記録を日付の降順で返します（`useCallback` で安定。バックアップ・全車両 CSV・重複判定用）。
  車両ごとにまとめて（未分類は `defaultVehicleId` の車両に入れて）それぞれの方式で連鎖計算を適用済みです（`applyFillChainByVehicle`）。
  ログイン中は 1,000 件ずつページングして全件を読みます。読み込み前や失敗時は日本語メッセージの `Error` を投げます。

### `useVehicleScope({ list? })`（`lib/useVehicleScope.ts`）

`useVehicles` と `useFuelRecords` を組み合わせ、画面が共通で使う「選択中の車両とその記録」をまとめて返します（/app・/history・/stats が使用）。
下の 2 つのフックはそのまま呼ぶので、データ更新の 2 経路と閲覧専用の扱いは変わりません。

戻り値: `vehicles`, `selectedVehicleId`, `setSelectedVehicleId`, `selectedVehicle`（一覧に無ければ `null`）, `distanceMode`, `defaultVehicleId`（`vehicles[0]?.id`）,
`records`, `loading`（`vehiclesLoading || recordsLoading`）, `vehiclesLoading`, `recordsLoading`, `error`（車両 → 記録の順に最初のエラー）, `readOnly`, `outage`,
`scopeKey`（`${selectedVehicleId}:${distanceMode}`）, `vehicleActions`（`addVehicle` / `addVehicles` / `updateVehicle` / `deleteVehicle`）,
`recordActions`（`addRecord` / `addRecords` / `updateRecord` / `deleteRecord` / `fetchAllRecords` / `refresh`）。

- 記録は車両一覧の読み込み完了後に読み込み（`enabled: !vehiclesLoading`）、`vehicles` を渡して車両ごとの方式で連鎖計算します（上の呼び出し規約どおり）。
- フォームには `{ vehicle: selectedVehicle, records }` をそのまま渡します（`useRecordForm` の `reset`、`ScanReviewSheet` の `vehicle` / `records`）。
  `records` は年・月フィルタなどをかける前の一覧です。プレビューの計算はフォーム側（`previewInChain`）で行い、各画面で同じ実装を持たないこと。
- 車両または距離の入力方式が変わったら、開いているフォームを閉じます。画面側は `scopeKey` の前回値を state に持ち、レンダー中に比較して調整します。
- `list: false` は選択中の車両の一覧を読み込みません（`useFuelRecords` に `enabled: false`）。全件取得・一括追加などの操作だけ使う画面用で、
  このとき `recordsLoading` は `false`、`loading` は車両の読み込みだけを表します（未ログイン時はローカルの記録が読まれるので `records` が空とは限らない）。
- 純粋関数 `scopeKeyOf` / `composeScopeError` / `combineScopeLoading` も同じファイルから export しています（`tests/useVehicleScope.test.ts`）。

画面の共通部品は `components/AppShell.tsx` にあります: `AppFrame`（ナビゲーション＝スマホの下部タブバー / PC のサイドバーと本文の器。
`components/AppNav.tsx`・`components/ScanActionMenu.tsx`）、`PageHeader`（見出しと右側の車両チップ。スマホではログインボタンも。
ログイン後の戻り先は `usePathname()`）、`HookErrorLine`（`error` の赤い行）、`ReadOnlyCaption`（「閲覧専用（クラウド接続待ち）」）。
車両の切り替えは `VehicleSelector`（チップ＋メニュー、最後の項目「車両を管理」）で、読み込み中スケルトンは `loading` プロップで表示します。
見た目の規則と部品は [design-system.md](./design-system.md)。

### `error` / `outage` / `readOnly`（両フック共通）

| 値 | 意味 |
|---|---|
| `error` | 障害以外の読み込みエラー（権限エラー、認証トークン欠落、移行失敗など）。画面に出せる日本語文字列 |
| `outage` | クラウド障害の種別（`"paused"` / `"unreachable"` / `null`）。全フックで共有 |
| `readOnly` | ログイン中かつ `outage != null`。このとき追加・更新・削除は日本語メッセージの `ReadOnlyError` を投げる |

書き込みの失敗は `withOutageHandling`（`lib/data/withOutage.ts`）が `toUserFacingWriteError` で日本語メッセージの `DataError` に変換します。UI は `useToast()` で表示します。

### `useRecordForm(initial?, context?)`（`lib/useRecordForm.ts`）

手動入力・最新記録の編集・履歴の編集・確認シートで共用するフォーム状態です。
`context` は `{ vehicle, records, odometerOptional? }`（`reset(record, context)` で差し替え）。`records` はその車両の記録（`useVehicleScope` の `records`）です。
戻り値: `draft`（文字列のまま保持）, `setField`, `reset`, `distanceMode`, `parsed`, `errors`, `isValid`, `hasCoreValue`, `metrics`,
`efficiencyNote`, `mergedRunCount`, `previousOdometer`, `previousOdometerStale`, `odometerRequired`, `odometerHint`, `pricePerUnitDisplay`, `toRecord()`。

- 全角数字・桁区切りカンマを正規化し、負数や数値でない入力はエラーにします。日付は必須です。
- 燃費・区間距離（オドメーターモード）・前回のオドメーターは、入力中の記録を `records` に差し込んだ連鎖計算の結果（`previewInChain`）をそのまま使います。
  フォームに連鎖の規則は持たないので、プレビューは保存後に読み取り時の連鎖計算が出す値と一致します（[10 章](#10-給油の連鎖計算fill-chain)）。単価は `calculateFuelMetrics`。
  オドメーターモード・部分給油・燃料種別・メモの入力と表示は [設計書](./design-fill-chain.md)の 4 章に従います。
- ドラフトの解析・検証・保存用オブジェクトの組み立て、重複判定の `findDuplicateRecord` などの純粋関数は `lib/recordDraft.ts` にあり、`lib/useRecordForm.ts` からも再エクスポートしています。

### `useRecordEditing({ scope, form, toast, confirm, updatedMessage?, onAdded? })`（`lib/useRecordEditing.ts`）

/app の最新記録カードと /history のカードで共用する、編集・手動入力フォームの開閉と保存です。`scope` は `useVehicleScope()` の戻り値をそのまま渡します。
戻り値: `editingRecordId`, `isEditing`, `isManualEntry`, `saving`, `startEditing(record)`（閲覧専用中は何もしない）, `startManualEntry()`（今日の日付の新規記録）, `cancel()`, `save()`, `addWithDuplicateCheck(record)`。

- `save()` は手動入力なら `addWithDuplicateCheck`（同じ日付・給油量・支払総額の記録があれば「重複して保存しますか？」を確認。キャンセルならフォームは開いたまま）、編集なら `updateRecord` です。
  成功の toast は追加が「給油記録を保存しました」、更新が `updatedMessage`（既定「給油記録を更新しました」、/history は「記録を更新しました」）。失敗は日本語メッセージの toast でフォームは開いたまま。
- `scopeKey`（車両・距離の入力方式）が変わったらフォームを閉じます（レンダー中の state 調整）。/history の移動・削除はページ側の処理です。

### メイン画面の構成（`/app`）

`app/app/page.tsx` は状態をフックから受け取り、`app/app/_components/` の部品に渡すだけです。

| 部品・フック | 役割 |
|---|---|
| `useVehicleScope` | 選択中の車両とその記録 |
| `useScanPipeline({ isSignedIn, toast, confirm })`（`lib/scan/`） | スキャンの状態（`loading` / `loadingStep` / `preview` / `sharedPending` / `scanResult`、同期判定の `isScanning()`）と処理（`processImageFile(file, { confirmBeforeAnalyze })` / `processSharedImage(token)` / `startSharedAnalysis` / `clearPreview` / `discardResult` / `abort`）。圧縮 → `requestAnalyze` → 確認シート。HTTP エラーの文言は `lib/analyze.ts` の `analyzeErrorMessage(status, body, { isSignedIn, retryAfter })`（401 は未ログイン / ログイン中で文言を分ける、422、429 は Retry-After の秒数、504、それ以外は requestId 付き）。アンマウント時は解析リクエストを中断する |
| `useImageDropPaste({ onImage, isBusy, toast })`（`lib/scan/`） | ドロップ先に付ける `dropZoneProps` と `isDragging`、window 全体のペースト（入力欄にフォーカスがあるときは無視）。最新のハンドラは `useEffectEvent` で参照する |
| `useRecordEditing` | 手動入力・最新記録の編集。確認シートの保存も `addWithDuplicateCheck` を使う |
| `ShortcutActionHandler`（`useShortcutActions`） | `?action=scan` / `album` / `manual` / `shared` / `share-unavailable` を `action` が付くたびに 1 回だけ実行し、`router.replace("/app")` で消す（/app を開いたままスキャンメニューから遷移しても実行する。`album` は capture なしのファイル選択）。実行条件は `shortcutReadinessOf`、判定は `resolveShortcutAction`。`useSearchParams` を使うので `<Suspense>` の内側に置き、/app の静的プリレンダーを保つ |
| `ScanPanel` | 左カラム。カメラボタン・アルバム / 手動入力・ヒント・プレビュー（次を撮る / 読み取る / 手動で入力）・ドロップ先と、非表示のファイル入力。ショートカットのスキャンは `ref` の `openCamera()` |
| `LatestRecordCard` / `ManualEntryCard` / `RecordCardSkeleton` | 右カラムの最新記録カード（表示・その場で編集・記録なしの案内。明細は `components/RecordStats.tsx`）/ 手動入力カード / 読み込み中 |
| `HistoryLinkCard` | 履歴画面へのリンク |

部品のテストは `tests/components/ScanPanel.test.tsx` / `LatestRecordCard.test.tsx`、純粋関数は `tests/analyze.test.ts` / `scanShortcuts.test.ts` / `scanClient.test.ts`（`requestAnalyze` を fetch のモックで検証）です。

## 5. ローカル → クラウド移行

localStorage から Supabase へのコピーは、`lib/migrateLocalData.ts` の `migrateLocalData(supabase, userId)` だけが行います。
呼び出し元はクラウドの初期化 `bootstrapCloud`（`lib/data/cloudBootstrap.ts`）だけで、`useVehicles` と `useFuelRecords` はクラウドから一覧を読む前にこれを待ちます。
初期化を実行した呼び出し（実行中に合流した呼び出しを含む）の結果は、取得済みの車両一覧 `vehicles` を運びます（完了済みの結果の使い回しでは古い可能性があるので外す）。`useDataStores` が次の `vehicles.list()` に 1 回だけ使い回すので、起動直後に同じ GET が 2 回飛びません。

- **初期化は userId ごとにタブ内で 1 回**: `migrateLocalData` → `ensureDefaultVehicle` を実行し、実行中は同じ Promise を共有、完了後は結果を使い回します。
  ただし移行するローカルデータ（`fuel_lens_data` / `fuel_lens_vehicles` / 退避キー）が残っていれば（ログアウト中に記録した等）やり直します（`hasLocalDataToMigrate`）。
- 移行が障害（停止・接続不可）で失敗したら初期化ごと失敗し、フックは閲覧専用・キャッシュ表示になります（次の読み込みで再試行）。
  障害以外の失敗（RLS 違反など）は日本語のメッセージ（`migrationErrorMessage`）を両フックの `error` に出して読み込みを続け、30 秒間は同じ結果を返します（退避⇄復元を繰り返さない）。
  ただし障害バナーの「再試行」（`fuel_lens_retry`）による再読み込みは `bootstrapCloud(…, { force: true })` で、この 30 秒の使い回しを飛ばして移行をやり直します（実行中の初期化には合流）。
  認証トークンの欠落は移行のエラーとしては出さず、続く既定車両の確保の失敗（再ログインの案内）になります。
- 既定車両の確保の失敗は初期化の失敗として扱い、次の読み込みで最初からやり直します。

`migrateLocalData` 自体は次の仕組みで 1 回しか実行されません。

1. **クロスタブロック**（`lib/crossTabLock.ts` の `withCrossTabLock`）: Web Locks API が使えれば `fuel_lens_migration_<userId>` を exclusive で取得します
   （取得待ちは約 30 秒で打ち切り）。使えなければ localStorage のリース `fuel_lens_migration_lock_<userId>`
   （20 秒ごとに更新、約 2 分で失効）で代替します。取得できないときは `CrossTabLockError`（日本語メッセージ）を投げます。
2. **タブ内の共有**: 実行中の Promise を userId ごとに保持し、同時呼び出しには同じ Promise を返します。
3. **キーの移動**: 挿入前に `fuel_lens_data` / `fuel_lens_vehicles` を `<key>_migrating_<userId>` へ移し、元キーを削除します。
   前回クラッシュした残骸は、ロックを持っている間だけ取り込みます。
4. **既定車両**: `users` 行を確保（`ensureUserRow`）してから、クラウドに車両が無ければローカルの `default-car`
   （無ければローカルの先頭車両）の名前・種別で既定車両を作成します。
5. **ID の対応表**: ローカル車両を 1 台挿入するたびに localId → uuid の対応を
   `fuel_lens_migration_vehicle_map_<userId>` に保存し、再試行で車両を二重登録しないようにします。
6. **記録のチャンク挿入**: 記録は 100 件ずつ挿入し、挿入済みのチャンクを退避データから取り除きます。
   `vehicle_id` は対応表で変換し、`default-car`・不明な ID・未設定はクラウドの既定車両に割り当てます。
   `date` / `created_at` は Postgres が受け付ける値に正規化します。
   `0004` の列（記録の `odometer` / `is_full` / `missed_previous` / `fuel_type` / `memo`、車両の `distance_mode` / `default_fuel_type`）は、ローカルに有効な値があるものだけを送ります（無ければ DB の既定値）。
7. **失敗時**: 退避データを元キーへマージして戻し、次回の読み込みで再試行します。
   障害以外の失敗では、データがブラウザに残っていることを `error` で利用者に伝えます。

既定車両の自動作成（`lib/data/cloudStore.ts` の `ensureDefaultVehicle`）も同じロックで直列化しています。`ensureUserRow` / `withStatus` も `cloudStore.ts` にあり、移行処理はそこから import します。

## 6. 障害時の動作

Supabase Free のプロジェクトが一時停止すると、API は HTTP 540 を返します
（停止の仕組みと予防策は [operations.md](./operations.md#3-supabase-の自動停止と-keepalive)）。
`lib/supabaseHealth.ts` が失敗を分類し、アプリ全体を閲覧専用に切り替えます。
クラウドのストアの呼び出しとクラウドの初期化は、すべて `withOutageHandling` / `runWithOutageHandling`（`lib/data/withOutage.ts`）を通り、
分類 → `setOutage` → 日本語の `DataError` への変換と、閲覧専用中の書き込みの拒否（`readOnlyError` と同じ文言）がここ 1 か所で行われます。

| 分類 | 条件（`classifySupabaseFailure`） |
|---|---|
| `paused` | ステータス 540、またはメッセージに `paused` を含む |
| `unreachable` | ステータス 0 または 500 以上、またはステータス不明のネットワーク例外 |
| `null`（障害ではない） | 上記以外（権限エラー・制約違反など）。各フックの `error` として扱う |

- 障害種別は sessionStorage（`fuel_lens_supabase_outage`）と window イベント `supabase_outage` で全コンポーネントに共有します。
- 正常に読み込めた一覧は `fuel_lens_cache_vehicles_<userId>` / `fuel_lens_cache_records_<userId>_<vehicleId>` に保存し、
  障害中はそれを閲覧専用で表示します（キーは `lib/supabaseHealth.ts` の `vehiclesCacheKey` / `recordsCacheKey`。`clearUserCaches` と同じ場所で定義）。
  書き込むのは `withCache`（`lib/data/withOutage.ts`）で、`list` の成功時に一覧を、成功した追加・更新・削除の後にその結果を反映した一覧を書きます。
  読み込みに失敗した（障害以外の失敗も含む）ときは、フックが `cached()` で最後に同期した一覧を表示します。
  書き込みの反映先は「最後に始まった `list` が成功した一覧」だけです。`list` を呼ぶたびに反映先を忘れ、その `list` が最新のまま成功したときだけキャッシュを書いて覚えます。
  そのため、(1) 失敗した `list` の後は、次に `list` が成功するまで書き込みを反映しません（最後に同期した一覧を残す）。
  (2) 古い `list` の応答は、後から始まった `list` や、その間の書き込みの結果を上書きしません。
  (3) 失敗が初期化（`bootstrap`）で起きた場合は `list` が呼ばれないので、前の `list` が成功していればその反映先が残り、その後の書き込みはキャッシュに反映されます。
  フックのアンマウント・ログアウト・ユーザー切り替えの後に届いた応答ではキャッシュを書きません。
- 閲覧専用中は `/history` / `/stats` / `/settings` に「閲覧専用（クラウド接続待ち）」と表示します（`useVehicles` と `useFuelRecords` の `readOnly` は同じ障害状態から決まる）。
- `SupabaseStatusBanner` はログイン中かつ障害中にだけ表示されます。
  「再試行」ボタンと、障害中のネットワーク復帰（`online`）・タブの再表示（自動分は 30 秒に 1 回まで）が
  `fuel_lens_retry` イベントを発火し、`useVehicles` / `useFuelRecords` が再読み込みします。
  読み込みに成功すると `clearOutage()` で障害を解除します。
- ログアウト・ユーザー切り替え時は、`syncCacheOwner` が前のユーザーのキャッシュと障害フラグを削除します。
- 認証トークンの欠落は障害として扱いません（閲覧専用にすると本当の原因が隠れるため）。
- テストは `tests/data/withOutage.test.ts`（540 / 0 → 障害とキャッシュ、閲覧専用ガード、42501 の文言）と `tests/supabaseHealth.test.ts` です。

## 7. 認証

- 認証は Clerk（`@clerk/nextjs`）です。`proxy.ts` の `clerkMiddleware()` は全ルートを公開のままにし、
  `/api/analyze` はルートハンドラ内の `auth()` で未ログインを 401 にします。
- Supabase へは、Clerk の JWT テンプレート **`supabase`** で発行したトークンを supabase-js の `accessToken` として渡します
  （`lib/supabaseClient.ts` の `SUPABASE_JWT_TEMPLATE`）。トークンには `role: "authenticated"` が必要で、
  RLS は `sub`（Clerk userId）と各行の `user_id` を照合します。
  テンプレートの設定要件は [supabase/README.md](../supabase/README.md#3-clerk-jwt-テンプレートの要件) を参照してください。
- Clerk からトークンを取得できないときは anon キーへ黙ってフォールバックせず、`SupabaseAuthTokenError`
  （「認証トークンを取得できませんでした。再ログインしてください。」）を投げます。
  オフラインによる取得失敗は障害（`unreachable`）として扱います。
- Supabase クライアントは userId ごとにメモ化し、未ログインでは作成しません。
- **将来の移行先**: Supabase の Third-Party Auth（Clerk ネイティブ連携）に切り替えると、JWT Secret の共有が不要になります。
  RLS ポリシーはそのまま使え、コードは `getToken({ template: SUPABASE_JWT_TEMPLATE })` を `getToken()` に変えるだけです。
  Clerk と Supabase の両方でダッシュボード設定が必要なため、[今後の候補](./roadmap.md) に載せています。

## 8. バックアップと復元

設定画面（`/settings`。メイン画面ヘッダーの「設定」リンクから開く）で、全車両・全記録の書き出しと復元を行います。
画面は `components/BackupPanel.tsx`、ロジックは `lib/backup.ts`（JSON）と `lib/csv.ts`（CSV）の純粋関数です。
未ログイン（localStorage）でもログイン中（Supabase）でも使えます。保存先の違いは `useVehicles` / `useFuelRecords` が吸収します。

### 書き出し

| 形式 | ファイル名 | 内容 |
|---|---|---|
| JSON | `fuel-lens-backup-YYYYMMDD-HHmm.json` | 全車両と全記録。復元に使える唯一の形式 |
| CSV | `fuellens_all_YYYY-MM-DD.csv` | 全車両の記録を 1 つにまとめた閲覧用。列は車両・日付・給油量・支払総額・単価・走行距離・燃費・店舗名に、オドメーター・満タン・記録漏れ・燃料種別・メモを加えたもの（[設計書 5 章](./design-fill-chain.md#5-周辺機能)）。復元には使えない |

- JSON は `{ app: "fuel-lens", version: 2, exportedAt, vehicles, records }` の形式です（スキーマバージョン 2。読み込みは 1 も受け付ける）。
  `vehicles` は `id` / `name` / `type` / `created_at` / `distance_mode` / `default_fuel_type` で、**`user_id` は含めません**。`records` は `FuelRecord` の列
  （`id` / `date` / `total_distance` / `fuel_amount` / `gas_station` / `price_per_unit` / `total_cost` / `fuel_efficiency` / `vehicle_id` / `created_at` / `odometer` / `is_full` / `missed_previous` / `fuel_type` / `memo`）です。
  version 1 との違いは、車両の `distance_mode` / `default_fuel_type` と、記録の `odometer` / `is_full` / `missed_previous` / `fuel_type` / `memo` が増えたことです。
- 書き出し時に `buildBackup` が値を正規化します（不正な数値は null、不正な日付は `created_at` の日付か書き出し日、id の重複は先勝ち）。
  古いローカルデータの欠損で、自分のバックアップが復元できなくなるのを防ぐためです。記録は日付の昇順に並べます。
- CSV は先頭に UTF-8 の BOM を付け、`=` `+` `-` `@` などで始まる文字列には `'` を付けて数式として実行されないようにします（CSV インジェクション対策）。
  未分類の記録は、既定車両（`vehicles[0]`）の名前で出力します。記録が 0 件のときは書き出しません。

### 復元

復元は **追記のみ** です。既存の車両・記録は削除も上書きもしません。

1. ファイルを選ぶと `parseBackup` が検証します。バックアップは利用者が編集できる信頼できない入力なので、形・型・値域・件数を厳密に確認し、
   既知のキーだけを取り出した新しいオブジェクトを使います。version 1 のファイルは、欠けたフィールドを既定値（トリップ・満タン・記録漏れなし・燃料種別とメモなし）で補い、常に version 2 の形にして返します。上限は車両 500 台・記録 50,000 件・30MB です。
   `app` が `fuel-lens` でない、`version` が 1 でも 2 でもない（新しい版を含む）、ID の重複、不正な日付・数値などは日本語メッセージで拒否します。
2. 既存の全記録を取得し、`planRestore` で計画を立てます。件数プレビュー（新規車両 / 既存に一致 / 追加される記録 / 重複でスキップ）を表示します。
3. 「復元する」を押すと確認ダイアログを出し、了承されたら最新の状態で計画を立て直します（確認中に別タブで変わっても二重登録しないため）。
4. 新規車両を `addVehicles` で追加し、作成された車両の ID で記録の `vehicle_id` を確定（`finalizeRestoreRecords`）してから、`addRecords` で追加します。
   進捗は「記録を追加中… N / M 件」と表示します。

**車両の対応付け**（バックアップの車両を上から順に）:

1. 既存に同じ `id` の車両があれば、それに対応付ける
2. なければ、まだ使っていない既存車両のうち、名前（前後の空白を除く）と種別が一致する最初の車両に対応付ける
3. それもなければ新規作成する

**記録の車両**: バックアップ内の車両を指す記録はその対応先へ入れます。`vehicle_id` が `null`・未分類（`default-*`）・バックアップに無い車両の記録は、
バックアップの先頭車両（書き出し時の既定車両）の対応先へ入れます。バックアップに車両が無ければ、既存の既定車両へ入れます。

**重複（スキップ）判定**: 次のいずれかに当てはまる記録は追加しません。

- 既存に同じ `id` の記録がある
- 既存に、同じ車両（対応付け後）・同じ日付・給油量の差が ±0.01 以内・同じ支払総額の記録がある（null 同士は一致とみなす。既存側の未分類は既存の既定車両とみなす）

**制約と失敗時の動作**:

- 閲覧専用（`readOnly`）中、車両一覧の読み込みエラー中、車両が 0 台のときは、復元ボタンを無効にします。
- ログイン中の記録追加は 100 件ずつの挿入です。途中で失敗すると、追加済みの分は残り、「N 件を追加したところで中断しました。」を含むメッセージを表示します。
  同じファイルをもう一度復元すれば、重複判定により残りだけが追加されます。
- 復元で追加した記録の ID は、未ログインでは `restored-` で始まるローカル採番、ログイン中は DB が採番する UUID になります（バックアップ内の ID は引き継ぎません）。

### 実行の共通化

復元（BackupPanel）と取り込み（ImportPanel）は、確認ダイアログの後の実行を同じコードで行います。

- `lib/restore.ts` の `executeRestore(backup, { vehicles, fetchAllRecords, addVehicles, addRecords }, onProgress?)` が上の手順 3〜4
  （全記録の取り直し → `planRestore` → `addVehicles` → `finalizeRestoreRecords` → `addRecords`）を実行し、
  `{ vehiclesAdded, recordsAdded, skipped, changed }` を返します。進捗は `prepare` → `vehicles`（新規車両があるとき）→ `records`（`done` / `total`）の順に通知します。
  失敗時は `RestoreError` を投げます。メッセージは元のエラー（`addRecords` の「N 件を追加したところで中断しました。…」など）のままです。
- `lib/useRestoreRunner.ts` の `useRestoreRunner` が、処理中フラグ（`"restore"` / `"import"`）、進捗の文言（「準備中…」「車両を追加中…（n 台）」「記録を追加中… d / t 件」）、
  成功・失敗の toast（「復元しました: …」/「取り込みました: …」と、失敗時の「もう一度ファイルを選ぶと、残りを…」）をまとめます。両パネルは `run({ backup, kind })` を呼ぶだけです。
  lib から components に依存しないよう、`toast` は呼び出し側（`useToast()`）から渡します。
- **データ概要の再読み込み**: 実行が終わると（成功・失敗とも）両パネルが `onDone(changed)` を呼び、設定画面は `changed` のときだけ記録数を読み込み直します。
  `changed` は「書き込み（`addVehicles` / `addRecords`）を 1 回でも行った」で、失敗しても途中まで追加済みの可能性があれば `true` です。
  重複だけで何も追加しなかったとき・書き込み前に失敗したときは読み直しません（以前の復元は毎回、取り込みは追加したときだけ読み直していたのを揃えた）。

### インポート（CSV）

設定画面の「インポート」（`components/ImportPanel.tsx`）で、他アプリや FuelLens 自身の CSV を取り込みます。
CSV を `lib/importers/` の純粋関数でバックアップ形式（`FuelLensBackup`、version 2）に変換し、以降は復元と同じ
`planRestore` → 確認 → `addVehicles` → `finalizeRestoreRecords` → `addRecords` の流れで **追記のみ** で追加します。
車両の対応付け・重複判定（同じ車両 + 日付 + 給油量 ±0.01 + 支払総額）も復元と同じなので、同じファイルを 2 回取り込んでも 2 回目は何も追加されません。
閲覧専用・車両一覧の読み込みエラー・車両 0 台のときは無効です。文字コードは UTF-8（壊れていれば Shift_JIS として読み直す）、上限は 30MB・50,000 件です。

| 形式 | 判定 | 車両 |
|---|---|---|
| Fuelio の CSV | `"## Vehicle"` と `"## Log"` のセクション行がある | 1 台。名前は `## Vehicle` の `Name`（画面で変更可）、種別は推定（画面で変更可） |
| FuelLens の全車両 CSV（設定画面） | ヘッダーが `車両,日付,給油量(L),支払総額(円),単価(円/L),走行距離(km),燃費(km/L),店舗名` | 車両名ごと。種別は同名の既存車両に合わせ、無ければ car |
| FuelLens の車両別 CSV（履歴画面） | ヘッダーが `給油日,走行距離(km),給油量(L),単価(円/L),支払総額(円),燃費(km/L),ガソリンスタンド名` | 1 台。名前はファイル名から推測（画面で変更可） |

**Fuelio の変換**（`lib/importers/fuelio.ts`。列は位置ではなくヘッダー名で探す）:

- `## Log` の `Data`（日付。`yyyy-MM-dd[ HH:mm]` のほか `dd.MM.yyyy`・`MM/dd/yyyy`・`dd/MM/yyyy` も読む。`## Vehicle` の `ImportCSVDateFormat` をヒントにする）、
  `Odo (km)`、`Fuel (litres)`、`Full`、`Price (optional)`、`City (optional)`、`Notes (optional)`、`Missed`、`FuelType`、`VolumePrice`、`UniqueId` を使います。
  マイル・ガロン単位の CSV はエラーにします。
- **車両の距離の入力方式**: 取り込み先が新規の車両なら `distance_mode = 'odometer'` にします（Fuelio は積算距離で記録するため）。
- **新しい列への対応**: `Odo` → `odometer`、`Full` → `is_full`、`Missed` → `missed_previous`、`FuelType` → `fuel_type`
  （Fuelio のコードは番号。既知の対応が無ければ `other`）、`Notes` → `memo` です。
- **区間距離と燃費**: インポータは計算しません。`total_distance` と `fuel_efficiency` は null のまま取り込み、読み取り時に `applyFillChain` が
  オドメーターの差分と部分給油の合算から導出します（先頭の行と `Missed=1` の行は区間距離が null。[10 章](#10-給油の連鎖計算fill-chain)）。
- **金額**: `Price` を支払総額とし、空なら `VolumePrice × 給油量` で補います。単価は `calculateFuelMetrics(null, 給油量, 支払総額)` で計算します（丸めはアプリ全体と同じ）。
- **店舗名**: `City` のみ。`Notes` は店舗名ではなくメモに入れます。
- **車両種別の推定**: `Tank1Capacity` が分かれば 20L 以下を bike、不明（0）なら車名・車種名（`CB` / `PCX` / `カブ` / Kawasaki など）から推定し、既定は car です。
- **ID**: 車両は `fuelio-<車両名の FNV-1a ハッシュ>`、記録は `fuelio-<同>-<UniqueId>`（無ければ `h<日付・積算距離・給油量のハッシュ>`、ファイル内の重複は `-2` …）。
  同じファイルからは同じ ID になります（ただし追加される記録の ID は復元と同じく新しく採番されるため、再取り込みの重複判定は上記の内容一致で行います）。
- 給油以外のセクション（`## Costs` など）は読みません。

**FuelLens CSV の変換**（`lib/importers/fuellensCsv.ts`）: 書き出し時に CSV インジェクション対策で付けた先頭の `'` を外し、日付・給油量・支払総額が読めない行は読み飛ばします。
単価は CSV の値を優先し、空なら `calculateFuelMetrics` で補います（燃費は読み取り時の連鎖計算が決める）。オドメーター・満タン・記録漏れ・燃料種別・メモの列があれば読み、無ければ既定値にします。ID は `fuellens-csv-<車両名と各列のハッシュ>` です。

## 9. PWA

ホーム画面に追加して、アプリのように起動できます。写真アプリの「共有」から FuelLens に画像を送ってスキャンできます（Web Share Target）。
**Service Worker は共有の受け取り専用で、キャッシュはしません。オフライン動作には対応していません**（[今後の候補](./roadmap.md)）。

- `app/manifest.ts` が `/manifest.webmanifest` を返します。`name` / `short_name` は `FuelLens`、`start_url` は `/app`、`display` は `standalone`、
  `orientation` は `portrait`、背景色とテーマ色は `#030712` です。`app/layout.tsx` の `metadata.manifest` から参照し、テーマ色は `viewport.themeColor` にも設定しています。
- アイコンは `public/icons/` の `icon-192.png` / `icon-512.png`（通常）と `icon-maskable-512.png`（maskable。余白付きの全面塗り）、
  iOS 用の `public/apple-touch-icon.png`（180x180。`metadata.icons.apple`）です。
- ショートカット（アイコンの長押しメニュー）は「スキャン」`/app?action=scan` と「手動で入力」`/app?action=manual` の 2 つです。
  `lib/scan/useShortcutActions.ts`（`app/app/page.tsx` の `ShortcutActionHandler`）が `action` パラメータを 1 回だけ処理し、処理後にパラメータを URL から取り除きます（再読み込みで繰り返し開かないため）。
- **Web Share Target（共有から読み取り）**: `manifest` の `share_target` は `POST /share`（`multipart/form-data`、画像は `image` フィールド、`accept: image/*`）です。
  `params` は `files` だけを宣言し（`title` / `text` / `url` は無し）、テキストやリンクの共有先には FuelLens を出しません。
  **SW が有効なら** 画像はサーバーへ送らず端末内だけで受け渡すので、サイズの上限もサーバー保存もありません。
  SW がまだ無いときはブラウザが画像ごとサーバーへ POST します（下の 4.）。流れは次のとおりです。
  1. 共有先に FuelLens を選ぶと、ブラウザが `/share` へ POST します。
  2. Service Worker（`public/sw.js`）がこの POST だけを横取りし、`crypto.randomUUID()` でワンタイムトークンを作って、
     画像を `{ blob, name, type, at, token }` として IndexedDB（DB `fuel-lens-share` / ストア `inbox` / キー `pending`）に保存し、
     `/app?action=shared&t=<token>` へ 303 リダイレクトします。画像が無い・保存に失敗したときは古い `pending` を削除してから
     `/app?action=share-unavailable` へリダイレクトします（前回の共有画像を誤って読み込まないため）。
     それ以外のリクエストには `respondWith` を呼ばず、ネットワークに任せます。
  3. メイン画面（`lib/scan/useScanPipeline.ts` の `processSharedImage`）が読み込み完了後（ログイン状態の確定後）に `lib/shareInbox.ts` の `takeSharedImage(t)` で画像を取り出して削除します。
     返すのは `token` が URL の `t` と一致し、保存から 10 分以内のものだけです（それ以外は削除して捨て、「共有された画像が見つかりませんでした」と表示）。
     画像は圧縮してプレビューに出しますが、**自動では解析しません**。`/share` へは他のサイトからもフォーム送信（クロスサイト POST）で画像を送り込めるため、
     「共有された画像を読み取りますか？」（`useToast` の confirm、ボタンは「読み取る」）で確認してから、ギャラリーと同じ経路（`/api/analyze` → 確認シート）に流します。
     キャンセルしてもプレビューは残り、プレビュー上の「読み取る」「手動で入力」「次を撮る」から選べます。
     未ログインでもプレビューは表示され、解析の 401 で「AIスキャンにはログインが必要」と案内します（手動入力はログイン不要）。
     処理後は `action` と `t` を URL から取り除きます。
  4. SW がまだ有効でない（インストール直後など）と、ブラウザは画像を含む POST を **サーバーへ送ります**。
     `next.config.ts` の `redirects()` が `content-type: multipart/form-data` の `/share` を **本文を読まずに** `/app?action=share-unavailable` へ 303 で戻し
     （それ以外の `/share` は `/app` へ 303）、画面は「共有された画像を受け取れませんでした。もう一度お試しください」と表示します。
     サーバーは画像を読まず保存もしませんが、通信としては届きます。また Vercel では本文が 4.5 MB を超えると、リダイレクトの前に 413 で拒否されることがあります。
     `redirects()` はメソッドを問わずルーティングの最初に評価されるため、`/share` のルート（`app/share/`）は置いていません。
- **Service Worker の登録**: `components/ServiceWorkerRegister.tsx`（`app/layout.tsx` にマウント）が本番ビルドでのみ `/sw.js` をスコープ `/` で登録します。
  開発中に試すときは `NEXT_PUBLIC_ENABLE_SW=1` を設定します。SW は `install` で `skipWaiting`、`activate` で `clients.claim` し、
  `{ type: "SKIP_WAITING" }` メッセージにも応じます。**キャッシュ（precache / Cache Storage）は一切使いません。**
  `proxy.ts`（Clerk）のマッチャーは `.js` の静的ファイルを除外するので `/sw.js` は素通しです。`/share` もマッチャーから除外しています（Clerk を通さずにリダイレクトする）。
- **動作確認（Android Chrome）**: 本番 URL（HTTPS）を開いて「ホーム画面に追加」（インストール）し、一度アプリを起動して SW を有効にします。
  フォトアプリで写真を開いて「共有」→ FuelLens を選ぶと、アプリが開いてプレビューと「共有された画像を読み取りますか？」の確認が出ます。
  共有先に出ない場合はインストールし直してください（共有先の登録はインストール時の manifest で決まります）。
- **iOS の制限**: iOS / iPadOS の Safari は `share_target` に対応していないため、共有メニューに FuelLens は出ません。
  iOS ではアプリ内のカメラ／画像選択、またはショートカットの「スキャン」を使います。
- アイコンの再生成: `app/icon.svg` を元に `node scripts/generate-icons.mjs` を実行します（インストール済みの `sharp` を使用。追加の依存なし）。
  生成後に各ファイルの寸法を表示するので確認し、出力されたファイルをコミットします。

## 10. 給油の連鎖計算（fill chain）

オドメーターモード、部分給油、記録漏れ（`missed_previous`）に対応するため、区間距離と燃費は **保存値ではなく読み取り時に導出** します。
仕様の正本は [design-fill-chain.md](./design-fill-chain.md)（2 章が計算、3 章が責務）、実装は `lib/fillChain.ts` の純粋関数 `applyFillChain(records, vehicle)` です。
入力は変更せず、`total_distance`（オドメーターモードのみ）と `fuel_efficiency` を上書きした新しい配列を返します。

### 計算ルール

車両ごとに、記録を **日付昇順 → オドメーター昇順 → `created_at` 昇順 → `id`** で並べ（`sortForChain`）、先頭から順に決めます。

- **区間距離**: トリップモードは入力された `total_distance`。オドメーターモードは `odometer − それまでの記録の odometer の最大値`（running max）
  （基準が無い、`odometer` が null、基準以下のとき（打ち間違いで値が戻った記録。基準は更新しない）は null）。
  オドメーターモードで `missed_previous` が true なら null（区間が信頼できない）。基準は `odometer` が基準より大きければ進みます。
  進められなかった（`odometer` が null か基準以下の）ときは、次に基準を進める記録を先頭扱い（距離 null、基準をその値にする）にします（間の持ち越し行はそのまま持ち越し行）。
  トリップモードの `missed_previous` の記録は入力した `total_distance` を保持し（編集で消さない）、燃費だけ null にします（run は切れる）。
- **持ち越し行（carry row）**: オドメーターモードで、`odometer` が null か基準以下のために区間が出せなかった記録（`missed_previous` ではない）。
  基準が進まないので、次に区間が出た記録の距離に持ち越し行の分も含まれます。そのため持ち越し行は **run を切らず**、燃費は null、給油量は run に積み上げます（部分給油と同じ扱い。満タン給油でも run を閉じない）。
  例: A(1000 km, 30 L) → B(オドメーターなし, 20 L) → C(1600 km, 20 L) は C が 600 km、600 ÷ (20 + 20) = 15.00。1000 → 1300 → 130 → 1600（各 20 L）は null / 15.00 / null / 7.50。
- **燃費**: 直前の満タン給油の次の記録から数えた「走行区間（run）」を単位にします。run が切れるのは `missed_previous` の記録と、トリップモードで区間距離が null の記録だけです。
  切った記録自身は新しい run に含めず（燃費 null、給油量も持ち越さない）、新しい run は **その次の記録から** 始まります。
  例: 5000 → 5200 → 5300（記録漏れ, 1.5 L）→ 5500（4.0 L）は、5500 が区間 200 km（基準は 5300）で 200 ÷ 4.0 = 50.00。
  - 部分給油（`is_full = false`）: 燃費は null。距離と給油量は run に積み上がり、**次の満タン給油でまとめて計算**します。
  - 満タン給油: run 内のすべての記録で距離と給油量が分かり、Σ給油量 > 0 のとき `Σ距離 / Σ給油量`（小数第 2 位）。それ以外は null。
  - 全件が満タンで記録漏れも無いトリップモードでは、従来の `距離 / 給油量` と一致します。
- 単価（`price_per_unit`）は従来どおり `total_cost / fuel_amount`。`fuel_type` と `memo` は計算に関与しません。

### 読み取りと書き込みの責務

- **読み取り**: `useFuelRecords` は `records`（選択中の車両の方式）と `fetchAllRecords`（車両ごと。未分類は既定車両）で `applyFillChain` を適用します。
  UI・統計・CSV・バックアップが見る値は常に導出値です。
- **統計**: `applyFillChain` は燃費が出た記録（run を閉じた満タン給油）にだけ、保存しない導出値 `run_distance` / `run_fuel` / `run_cost`
  （その run の Σ区間距離・Σ給油量・Σ支払総額。支払総額の無い記録を含む run は `run_cost = null`）を付けます。
  `lib/stats/` の `summarize` は平均燃費（Σ`run_distance` ÷ Σ`run_fuel`）と円/km（Σ`run_cost` ÷ Σ`run_distance`）を run 単位で求め、
  持ち越し行・部分給油で分子と分母の区間がずれないようにします。平均単価・合計値・燃費の単純平均は記録ごと（部分給油も合計に含める）。
  全件が満タンのトリップモードでは従来の値と同じです。`run_*` は `pickRecordColumns`・移行・バックアップ・CSV のどれにも含まれません。
- **書き込み**: フォームは自分の記録について導出できる値（`previewInChain` の `fuel_efficiency` と、オドメーターモードの区間距離、単価）を計算して保存します。
  隣の記録の保存値が古くなっても、読み取り時の再計算で正しく表示されるため、DB を追いかけて更新しません。
- **フォームのオドメーター**: オドメーターモードでオドメーターが必須なのは手動の新規記録だけです（`useRecordForm` の `odometerRequiredFor`）。
  既存の記録の編集とスキャン結果は未入力でも保存でき、「オドメーターを入力すると区間距離を自動計算します」と注意を出します（保存される区間距離は null で、連鎖計算では持ち越し行）。
- **フォームのプレビュー**: `previewInChain(records, vehicle, candidate)` は、入力中の記録（候補）を 1 台分の記録に差し込んで連鎖計算の本体を走らせ、
  候補の `total_distance` / `fuel_efficiency`、run に合算した部分給油・持ち越し行の件数 `runCount`、直前の基準 `base`（前回のオドメーター）と `baseStale` を返します。
  編集中の記録は同じ ID の記録を置き換え（created_at と id は保存値のまま。一覧から消えていたら新規として扱う）、新規は「いま」の代わりの最大の created_at で追加するので、
  同じ日付の記録の中での位置（オドメーター順、created_at の無い古い記録より前）も含めて保存後の連鎖計算と一致します。
  `useRecordForm` は日付・オドメーター・区間距離・給油量・支払総額・満タン・記録漏れの入力が変わるたびに計算し直します（入力途中の不正な日付の間は開いたときの日付の位置）。
  `records` はフォームを開いたとき（`reset`）に渡した一覧です。保存する導出値は読み取り時に再計算されるので、開いている間に一覧が再読み込みされても保存結果は正しく表示されます。
  直前の記録漏れで基準が無いとき（`baseStale`）は「記録漏れの直後のため区間は計算できません」と表示します。
  元の記録の燃費は、算出元（日付・区間距離・オドメーター・給油量・満タン・記録漏れ）を変えるまで保存値を表示・保存します（インポートした値などを店舗名だけの編集で書き換えない）。
- **互換性**: 既存の記録は `is_full = true`・`missed_previous = false`・`odometer = null` として扱われ、トリップモードの車両の表示と計算は変わりません。
- **補助関数**: `previewInChain`（フォームのプレビュー。上記）、`normalizeRecord` / `normalizeVehicle`（新しい列の既定値補完）、
  `FUEL_TYPES` / `FUEL_TYPE_LABELS`（燃料種別の一覧と表示名）、`MEMO_MAX_LENGTH`（200）。

## 11. 統計

`/stats` は選択中の車両の記録（連鎖計算済み）を期間フィルタ（`filterByPeriod`）で絞り、`lib/stats/` の純粋関数で集計します。
平均燃費・円/km を run 単位で求める理由は [10 章](#10-給油の連鎖計算fill-chain) の「統計」を参照してください。
画面が使う値（期間フィルタ後の記録、サマリー、各グラフの系列と軸、スタンド比較の表示行と棒の長さ、前回比）は純粋関数 `buildStatsModel`（`lib/stats/model.ts`）が一度に導出し、`app/stats/_components/` の部品は model の一部を受け取って描画するだけです。

### 単価トレンドとスタンド比較

> スタンド比較（店舗別の平均単価）は 2026-10-08 に画面から外しました（利用者の要望）。部品 `app/stats/_components/StationComparison.tsx` と `lib/stats/prices.ts` / `stationRows.ts` の計算・テストは残しています。

- **単価**: 記録の `price_per_unit`（正の値）を使い、無ければ支払総額 ÷ 給油量を `calculateFuelMetrics` と同じ 0.1 円単位で丸めて補います（`recordPrice`）。
- **単価の推移**: `buildPriceSeries` が日付の有効な記録を日付昇順（同日は id 順）に並べます。2 点未満は空表示です。
  平均線は期間の平均単価（Σ支払総額 ÷ Σ給油量。サマリーカードの「平均単価」と同じ規則）で、目盛りは `buildPriceAxis` が小数第 1 位で作ります。
  見出しの「前回比 / 30日平均比 / 90日平均比」は `priceDelta` で、最新の単価から 1 つ前の単価、最新の給油日から遡って 30 日 / 90 日以内の
  ほかの給油の単価の単純平均を引いた値です。最新の給油についての表示なので、比較の基準が欠けないよう期間フィルタを掛けない全記録で求めます。
- **スタンド別の単価**: `summarizeStations` が店舗名を `lib/stations.ts` の `stationKey` でまとめます。キーは「ブランド + 店舗名」で、
  NFKC 正規化（全角・半角）、会社の種類（(株)・株式会社・(有) など）、ブランドの別名（ENEOS / エネオス / Dr.Drive、出光 / apollostation / 昭和シェル、
  JA-SS / JA−SS / JAーSS など）、「セルフ」、空白と区切り記号（U+2212 のマイナス記号、かなの後ろ以外の「ー」を含む）、末尾の「店」「SS」の違いを吸収します
  （例: 「ENEOS セルフつつじヶ丘」と「ＥＮＥＯＳ　セルフつつじヶ丘店」は同じスタンド）。
  別名は単語の途中では一致させません。英字の別名は前後が英字でないとき、カタカナの別名は前後がカタカナ・「ー」でないとき（隣が「セルフ」なら可）だけ一致します
  （「コスモス薬品」「シェルター」「オートモービル」はブランドなし）。他の名前に紛れやすい「日石」「日本石油」「ゼネラル」は辞書に入れていません
  （「朝日石油」「西日本石油」はブランドなしで、名前全体がキーに残ります）。
  表示名はグループ内で最も多い表記（`normalizeStationName` で正規化。末尾の「店」は残す）です。
  平均単価は Σ支払総額 ÷ Σ給油量（両方がある記録のみ。無ければ単価の単純平均）、並びは給油回数の降順で、画面には上位 8 件と「他 n 件」を出します。
  棒の長さは表示中のスタンドの平均単価の最安を 15%、最高を 100% とした線形の目盛りです（差が数円でも見分けられるように。1 件だけ・全て同額なら 100%）。
  「最安」は単価の分かる給油（`pricedVisits`）が 2 回以上のスタンドが 2 件以上あるときだけ、その中で平均単価が最も安いものに付けます
  （同額なら `pricedVisits`、さらに給油回数の多い方）。
  ブランド辞書（`STATION_BRANDS`）は判定用の小さな一覧で、外部のデータは参照しません。店舗名の無い記録はスタンド別には出ませんが、平均単価には含めます。
