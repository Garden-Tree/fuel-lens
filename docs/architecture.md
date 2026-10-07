# アーキテクチャ

FuelLens の構成、データの流れ、主要なモジュールの役割をまとめます。
デプロイ・運用は [operations.md](./operations.md)、AI 解析 API は [api-analyze.md](./api-analyze.md) を参照してください。

## 1. ディレクトリ構成

| パス | 役割 |
|---|---|
| `app/page.tsx` | ランディングページ（Server Component）。対話部分は `components/landing/*` |
| `app/app/page.tsx` | メイン画面。スキャン（画像の選択・ドロップ・貼り付け）、手動入力、最新記録の確認・編集 |
| `app/history/page.tsx` | 履歴一覧。編集・削除・別車両への移動・年月フィルタ・並べ替え・CSV 出力 |
| `app/stats/page.tsx` | 統計サマリーとグラフ（recharts）。期間フィルタ（全期間 / 1 年 / 6 ヶ月 / 3 ヶ月） |
| `app/settings/page.tsx` | 設定画面（`/settings`）。データ概要とバックアップ・復元（[8 章](#8-バックアップと復元)） |
| `app/manifest.ts` | PWA の Web App Manifest（`/manifest.webmanifest`。[9 章](#9-pwa)） |
| `app/api/analyze/route.ts` | Gemini で画像を解析する API（[api-analyze.md](./api-analyze.md)） |
| `app/api/keepalive/route.ts` | Supabase 自動停止対策のエンドポイント（[operations.md](./operations.md#3-supabase-の自動停止と-keepalive)） |
| `app/layout.tsx` | `ClerkProvider` / `ToastProvider` / `UserSync` / `SupabaseStatusBanner`、`metadata` と `viewport` |
| `app/error.tsx` / `app/global-error.tsx` / `app/not-found.tsx` | エラー画面・404 |
| `components/ScanReviewSheet.tsx` | スキャン結果の確認シート（保存前に確認・修正する） |
| `components/EditFuelRecordForm.tsx` | 記録の入力フォーム（手動入力・編集・確認シートで共用） |
| `components/ManageVehiclesModal.tsx` / `components/VehicleSelector.tsx` | 車両の管理モーダル / 車両の切り替え |
| `components/BackupPanel.tsx` | 設定画面の本体。データ概要、JSON / CSV の書き出し、復元（ファイル選択 → 件数プレビュー → 確認 → 追加） |
| `components/ImportPanel.tsx` | 設定画面の「インポート」。Fuelio / FuelLens の CSV を読み込み、復元と同じ流れで追加する（[8 章](#インポートcsv)） |
| `components/Toast.tsx` | `ToastProvider` と `useToast()`（通知と確認ダイアログ） |
| `components/UserSync.tsx` | ログイン中のユーザーを `users` テーブルへ upsert |
| `components/SupabaseStatusBanner.tsx` | クラウド障害時の警告バナーと「再試行」 |
| `lib/analyze.ts` | `/api/analyze` の純粋ヘルパーと型（他の lib に依存しない） |
| `lib/calculations.ts` | `calculateFuelMetrics`（燃費・単価の計算） |
| `lib/fillChain.ts` | 給油の連鎖計算 `applyFillChain`（オドメーターの差分・部分給油の合算・記録漏れでの連鎖切断）と、燃料種別・距離の入力方式の型・既定値補完（`normalizeRecord` / `normalizeVehicle`）。純粋関数（[10 章](#10-給油の連鎖計算fill-chain)） |
| `lib/stats.ts` | 統計ページの純粋な集計ロジック |
| `lib/recordFilters.ts` | 車両・未分類の判定（純粋関数） |
| `lib/backup.ts` | バックアップ JSON の組み立て・検証（`parseBackup`）・復元計画（`planRestore` / `finalizeRestoreRecords`）。純粋関数 |
| `lib/csv.ts` | CSV の組み立て・エスケープ・ダウンロード。履歴画面の CSV 出力と設定画面の全車両 CSV で共有 |
| `lib/importers/fuelio.ts` / `lib/importers/fuellensCsv.ts` | CSV の取り込み（Fuelio / FuelLens の CSV → バックアップ形式）。純粋関数 |
| `lib/useVehicles.ts` / `lib/useFuelRecords.ts` / `lib/useRecordForm.ts` | データフックとフォーム状態（[4 章](#4-フック-api)） |
| `lib/useBackdropClose.ts` | モーダルの背景クリックで閉じるハンドラ（ドラッグでの誤閉じを防ぐ） |
| `lib/migrateLocalData.ts` | ローカル → クラウドの移行と既定車両の自動作成（[5 章](#5-ローカル--クラウド移行)） |
| `lib/supabaseClient.ts` | ユーザーごとの Supabase クライアント（Clerk JWT 付き） |
| `lib/supabaseHealth.ts` | 障害の分類、閲覧専用モード、キャッシュ、再試行（[6 章](#6-障害時の動作)） |
| `public/icons/` / `public/apple-touch-icon.png` | PWA アイコン（`icon-192.png` / `icon-512.png` / `icon-maskable-512.png` と 180x180 の apple-touch-icon）。`scripts/generate-icons.mjs` が生成 |
| `scripts/generate-icons.mjs` | `app/icon.svg` から PWA アイコンを生成するスクリプト（`node scripts/generate-icons.mjs`） |
| `tests/*.test.ts` | Vitest の単体テスト（`environment: "node"`。対象は `lib/` の関数） |
| `supabase/migrations/*.sql` | スキーマ・RLS・keepalive・給油の連鎖計算用の列（`0004_fill_chain.sql`）（冪等）。手順は [supabase/README.md](../supabase/README.md) |
| `docs/` | このドキュメント群。連鎖計算の仕様は [design-fill-chain.md](./design-fill-chain.md) |
| `.github/workflows/` | `ci.yml`（CI）と `supabase-keepalive.yml`（keepalive の予備経路） |
| `proxy.ts` | Clerk ミドルウェア。Next.js 16 ではファイル名が `proxy.ts`。全ルートを公開のままにしている |
| `vercel.json` | Vercel Cron の定義 |
| `next.config.ts` | `agentRules: false`（`next dev` による CLAUDE.md の自動生成を無効化） |
| `csv/` | 個人の給油記録・DB バックアップ置き場（`.gitignore` 済み。コミットしない） |

## 2. データフロー

保存先はログイン状態で切り替わります。データを更新する処理は必ず両方の経路を実装します。

| 状態 | 保存先 | 備考 |
|---|---|---|
| 未ログイン | ブラウザの localStorage（`fuel_lens_vehicles` / `fuel_lens_data`） | その端末・ブラウザのみ。AI 解析は使えない（`ALLOW_ANONYMOUS_SCAN=true` の場合を除く） |
| ログイン中 | Supabase（ブラウザから anon キー + Clerk JWT で PostgREST に直接アクセス） | RLS で自分の行だけに制限。正常に読めた一覧は障害時用に localStorage へキャッシュ |

- 未ログインでも画面は表示・操作できます（`proxy.ts` は全ルートを公開のままにしている）。
  AI 解析だけは `/api/analyze` がログインを要求します。
- ログインすると、`useVehicles` / `useFuelRecords` の読み込み時に `migrateLocalData` が走り、
  ローカルの記録をクラウドへ移します（[5 章](#5-ローカル--クラウド移行)）。
- スキャンの流れ: 画像を 0.8MB 以下・長辺 1200px の JPEG に圧縮 → `POST /api/analyze` → 確認シートで確認・修正 →
  同じ日付・給油量・支払総額の記録があれば確認ダイアログ → `addRecord`。解析結果を自動保存することはありません。
- 選択中の車両 ID は localStorage に保存します。未ログイン時は `fuel_lens_selected_vehicle_id`、ログイン時はユーザーごとの `fuel_lens_selected_vehicle_id_<userId>` を使い、保存値が現在の車両一覧に無い場合は既定車両へフォールバックして保存値を書き換えます。

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
| `fuel_records` | `odometer` | numeric null | null | 給油時の積算距離（km）。オドメーターモードの車両では必須入力 |
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

- ログイン中は読み込みのたびに `migrateLocalData` → `ensureDefaultVehicle` の順に実行します。
- 読み込みに失敗したときはローカルの既定車両へフォールバックせず、最後に同期した一覧（キャッシュ）を表示します。
- `settings` は `VehicleSettings`（`{ distance_mode?, default_fuel_type? }`）。省略したキーは、追加ではトリップ / 未指定、更新では変更なしです。
  不明な値は `sanitizeVehicleSettings` が捨てます。更新は名前・種別・設定を 1 回の update で保存し、方式を切り替えても既存の記録は変更しません（表示は読み取り時に再計算される）。
- 読み込んだ車両（ローカル・クラウド・キャッシュ）は `normalizeVehicle` で新しい列を補います（`0004` 適用前の DB でも動く）。
- `addVehicles(items: ({ name, type } & VehicleSettings)[])`（復元用）は車両をまとめて追加し、作成した `Vehicle[]` を返します。
  未ログインでは `local-vehicle-<時刻>-<連番>` の ID でローカルに追加し、ログイン中は 1 回の insert で追加します（閲覧専用中は日本語エラー）。

### `useFuelRecords(selectedVehicleId?, defaultVehicleId?, { enabled?, vehicles? })`（`lib/useFuelRecords.ts`）

戻り値: `records`（日付の降順）, `loading`, `error`, `outage`, `readOnly`, `addRecord`, `addRecords(items, { onProgress })`, `updateRecord`, `deleteRecord`, `fetchAllRecords()`, `refresh()`。

- 呼び出し側は `defaultVehicleId` に `vehicles[0]?.id`、`enabled` に `!vehiclesLoading`、`vehicles` に `useVehicles` の `vehicles` を渡します。
  `vehicles` は連鎖計算で各車両の `distance_mode` を知るために使い、省略時と一覧に無い車両はトリップモードとして扱います。
- `records` は保存値ではなく、`applyFillChain` を適用した導出値です。内部では保存値（新しい列は既定値で補完済み）を state に持ち、描画時に選択中の車両の方式で連鎖計算します。
  追加・更新・削除で隣の記録の燃費が変わっても、車両の方式を切り替えても即座に反映されます（[10 章](#10-給油の連鎖計算fill-chain)）。
- `addRecord` / `updateRecord` / `addRecords` は `pickRecordColumns` で既知の列だけを保存し、新しい列を検証します
  （`odometer` は 0 以上の有限数、`fuel_type` は 4 値、`memo` は 200 文字まで、`is_full` / `missed_previous` は真偽値のみ）。新しい列を省略した保存は DB の既定値になり、`0004` 適用前の DB でも成功します。
- ログイン中は `selectedVehicleId` が UUID になるまでクエリを発行しません。
- 車両削除などで記録が別経路から変わると、`fuel_records_changed` イベントで再読み込みします。
- `addRecords(items, { onProgress })`（復元用）は、選択中の車両で絞らず、各記録の `vehicle_id` のまま一括追加して追加件数を返します。
  未ログインでは `restored-<時刻>-<連番>` の ID でローカルに追記します。ログイン中は 100 件ずつ挿入し、
  `vehicle_id` が UUID でない記録があれば挿入前に日本語エラーを投げます。途中で失敗したときは
  「N 件を追加したところで中断しました。」を先頭に付けたメッセージを投げます（追加済みの分は残る）。完了後に `fuel_records_changed` を発火します。
- `fetchAllRecords()` は全車両の記録を日付の降順で返します（`useCallback` で安定。バックアップ・全車両 CSV・重複判定用）。
  車両ごとにまとめて（未分類は `defaultVehicleId` の車両に入れて）それぞれの方式で連鎖計算を適用済みです（`applyFillChainByVehicle`）。
  ログイン中は 1,000 件ずつページングして全件を読みます。読み込み前や失敗時は日本語メッセージの `Error` を投げます。

### `error` / `outage` / `readOnly`（両フック共通）

| 値 | 意味 |
|---|---|
| `error` | 障害以外の読み込みエラー（権限エラー、認証トークン欠落、移行失敗など）。画面に出せる日本語文字列 |
| `outage` | クラウド障害の種別（`"paused"` / `"unreachable"` / `null`）。全フックで共有 |
| `readOnly` | ログイン中かつ `outage != null`。このとき追加・更新・削除は日本語メッセージの `ReadOnlyError` を投げる |

書き込みの失敗は `toUserFacingWriteError` で日本語メッセージの `Error` に変換されます。UI は `useToast()` で表示します。

### `useRecordForm(initial?)`（`lib/useRecordForm.ts`）

手動入力・最新記録の編集・履歴の編集・確認シートで共用するフォーム状態です。
戻り値: `draft`（文字列のまま保持）, `setField`, `reset`, `parsed`, `errors`, `isValid`, `hasCoreValue`, `metrics`,
`pricePerUnitDisplay`, `toRecord()`。

- 全角数字・桁区切りカンマを正規化し、負数や数値でない入力はエラーにします。日付は必須です。
- 単価と燃費は `calculateFuelMetrics` で入力に追従して再計算します。オドメーターモード・部分給油・燃料種別・メモの入力と表示は [10 章](#10-給油の連鎖計算fill-chain) と [設計書](./design-fill-chain.md)の 4 章に従います。
- 重複判定の `findDuplicateRecord` など、純粋関数も同じファイルから export しています。

## 5. ローカル → クラウド移行

localStorage から Supabase へのコピーは、`lib/migrateLocalData.ts` の `migrateLocalData(supabase, userId)` だけが行います。
`useVehicles` と `useFuelRecords` の両方から呼ばれますが、次の仕組みで 1 回しか実行されません。

1. **クロスタブロック**: Web Locks API が使えれば `fuel_lens_migration_<userId>` を exclusive で取得します
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

既定車両の自動作成（`ensureDefaultVehicle`）も同じロックで直列化しています。

## 6. 障害時の動作

Supabase Free のプロジェクトが一時停止すると、API は HTTP 540 を返します
（停止の仕組みと予防策は [operations.md](./operations.md#3-supabase-の自動停止と-keepalive)）。
`lib/supabaseHealth.ts` が失敗を分類し、アプリ全体を閲覧専用に切り替えます。

| 分類 | 条件（`classifySupabaseFailure`） |
|---|---|
| `paused` | ステータス 540、またはメッセージに `paused` を含む |
| `unreachable` | ステータス 0 または 500 以上、またはステータス不明のネットワーク例外 |
| `null`（障害ではない） | 上記以外（権限エラー・制約違反など）。各フックの `error` として扱う |

- 障害種別は sessionStorage（`fuel_lens_supabase_outage`）と window イベント `supabase_outage` で全コンポーネントに共有します。
- 正常に読み込めた一覧は `fuel_lens_cache_vehicles_<userId>` / `fuel_lens_cache_records_<userId>_<vehicleId>` に保存し、
  障害中はそれを閲覧専用で表示します。
- `SupabaseStatusBanner` はログイン中かつ障害中にだけ表示されます。
  「再試行」ボタンと、障害中のネットワーク復帰（`online`）・タブの再表示（自動分は 30 秒に 1 回まで）が
  `fuel_lens_retry` イベントを発火し、`useVehicles` / `useFuelRecords` が再読み込みします。
  読み込みに成功すると `clearOutage()` で障害を解除します。
- ログアウト・ユーザー切り替え時は、`syncCacheOwner` が前のユーザーのキャッシュと障害フラグを削除します。
- 認証トークンの欠落は障害として扱いません（閲覧専用にすると本当の原因が隠れるため）。

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

ホーム画面に追加して、アプリのように起動できます。**Service Worker は未実装で、オフライン動作・Web Share Target には対応していません**
（[今後の候補](./roadmap.md)）。

- `app/manifest.ts` が `/manifest.webmanifest` を返します。`name` / `short_name` は `FuelLens`、`start_url` は `/app`、`display` は `standalone`、
  `orientation` は `portrait`、背景色とテーマ色は `#030712` です。`app/layout.tsx` の `metadata.manifest` から参照し、テーマ色は `viewport.themeColor` にも設定しています。
- アイコンは `public/icons/` の `icon-192.png` / `icon-512.png`（通常）と `icon-maskable-512.png`（maskable。余白付きの全面塗り）、
  iOS 用の `public/apple-touch-icon.png`（180x180。`metadata.icons.apple`）です。
- ショートカット（アイコンの長押しメニュー）は「スキャン」`/app?action=scan` と「手動で入力」`/app?action=manual` の 2 つです。
  `app/app/page.tsx` が `action` パラメータを 1 回だけ処理し、処理後にパラメータを URL から取り除きます（再読み込みで繰り返し開かないため）。
- アイコンの再生成: `app/icon.svg` を元に `node scripts/generate-icons.mjs` を実行します（インストール済みの `sharp` を使用。追加の依存なし）。
  生成後に各ファイルの寸法を表示するので確認し、出力されたファイルをコミットします。

## 10. 給油の連鎖計算（fill chain）

オドメーターモード、部分給油、記録漏れ（`missed_previous`）に対応するため、区間距離と燃費は **保存値ではなく読み取り時に導出** します。
仕様の正本は [design-fill-chain.md](./design-fill-chain.md)（2 章が計算、3 章が責務）、実装は `lib/fillChain.ts` の純粋関数 `applyFillChain(records, vehicle)` です。
入力は変更せず、`total_distance`（オドメーターモードのみ）と `fuel_efficiency` を上書きした新しい配列を返します。

### 計算ルール

車両ごとに、記録を **日付昇順 → オドメーター昇順 → `created_at` 昇順 → `id`** で並べ（`sortForChain`）、先頭から順に決めます。

- **区間距離**: トリップモードは入力された `total_distance`。オドメーターモードは `odometer − それまでの記録の odometer の最大値`（running max）
  （基準が無い、`odometer` が null、基準以下のとき（打ち間違いで値が戻った記録。基準は更新しない）は null）。どちらのモードでも `missed_previous` が true なら null（区間が信頼できない）。
- **燃費**: 直前の満タン給油の次の記録から数えた「走行区間（run）」を単位にします。`missed_previous` の記録や区間距離が null の記録で run は切れ、その記録から新しい run が始まります。
  - 部分給油（`is_full = false`）: 燃費は null。距離と給油量は run に積み上がり、**次の満タン給油でまとめて計算**します。
  - 満タン給油: run 内のすべての記録で距離と給油量が分かり、Σ給油量 > 0 のとき `Σ距離 / Σ給油量`（小数第 2 位）。それ以外は null。
  - 全件が満タンで記録漏れも無いトリップモードでは、従来の `距離 / 給油量` と一致します。
- 単価（`price_per_unit`）は従来どおり `total_cost / fuel_amount`。`fuel_type` と `memo` は計算に関与しません。

### 読み取りと書き込みの責務

- **読み取り**: `useFuelRecords` は `records`（選択中の車両の方式）と `fetchAllRecords`（車両ごと。未分類は既定車両）で `applyFillChain` を適用します。
  UI・統計・CSV・バックアップが見る値は常に導出値です。`lib/stats.ts` の Σkm/ΣL は導出済みの `total_distance` と `fuel_amount` を使い、部分給油も合計に含めます。
- **書き込み**: フォームは自分の記録について導出できる値（トリップモードの `fuel_efficiency`、単価）を計算して保存します。
  隣の記録の保存値が古くなっても、読み取り時の再計算で正しく表示されるため、DB を追いかけて更新しません。
- **互換性**: 既存の記録は `is_full = true`・`missed_previous = false`・`odometer = null` として扱われ、トリップモードの車両の表示と計算は変わりません。
- **補助関数**: `previousOdometer`（フォームの「前回から ○○ km」表示用に、連鎖計算が基準にするオドメーター（それまでの最大値）を返す）、`normalizeRecord` / `normalizeVehicle`（新しい列の既定値補完）、
  `FUEL_TYPES` / `FUEL_TYPE_LABELS`（燃料種別の一覧と表示名）、`MEMO_MAX_LENGTH`（200）。
