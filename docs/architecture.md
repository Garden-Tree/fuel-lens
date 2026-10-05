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
| `components/Toast.tsx` | `ToastProvider` と `useToast()`（通知と確認ダイアログ） |
| `components/UserSync.tsx` | ログイン中のユーザーを `users` テーブルへ upsert |
| `components/SupabaseStatusBanner.tsx` | クラウド障害時の警告バナーと「再試行」 |
| `lib/analyze.ts` | `/api/analyze` の純粋ヘルパーと型（他の lib に依存しない） |
| `lib/calculations.ts` | `calculateFuelMetrics`（燃費・単価の計算） |
| `lib/stats.ts` | 統計ページの純粋な集計ロジック |
| `lib/recordFilters.ts` | 車両・未分類の判定（純粋関数） |
| `lib/backup.ts` | バックアップ JSON の組み立て・検証（`parseBackup`）・復元計画（`planRestore` / `finalizeRestoreRecords`）。純粋関数 |
| `lib/csv.ts` | CSV の組み立て・エスケープ・ダウンロード。履歴画面の CSV 出力と設定画面の全車両 CSV で共有 |
| `lib/useVehicles.ts` / `lib/useFuelRecords.ts` / `lib/useRecordForm.ts` | データフックとフォーム状態（[4 章](#4-フック-api)） |
| `lib/useBackdropClose.ts` | モーダルの背景クリックで閉じるハンドラ（ドラッグでの誤閉じを防ぐ） |
| `lib/migrateLocalData.ts` | ローカル → クラウドの移行と既定車両の自動作成（[5 章](#5-ローカル--クラウド移行)） |
| `lib/supabaseClient.ts` | ユーザーごとの Supabase クライアント（Clerk JWT 付き） |
| `lib/supabaseHealth.ts` | 障害の分類、閲覧専用モード、キャッシュ、再試行（[6 章](#6-障害時の動作)） |
| `public/icons/` / `public/apple-touch-icon.png` | PWA アイコン（`icon-192.png` / `icon-512.png` / `icon-maskable-512.png` と 180x180 の apple-touch-icon）。`scripts/generate-icons.mjs` が生成 |
| `scripts/generate-icons.mjs` | `app/icon.svg` から PWA アイコンを生成するスクリプト（`node scripts/generate-icons.mjs`） |
| `tests/*.test.ts` | Vitest の単体テスト（`environment: "node"`。対象は `lib/` の関数） |
| `supabase/migrations/*.sql` | スキーマ・RLS・keepalive（冪等）。手順は [supabase/README.md](../supabase/README.md) |
| `docs/` | このドキュメント群 |
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

定義は `supabase/migrations/0001_schema_and_rls.sql` にあります。

| テーブル | 主な列 | 備考 |
|---|---|---|
| `users` | `id`（text、Clerk userId）, `email`（null 可）, `updated_at` | Clerk ユーザーのミラー。`UserSync` が upsert する |
| `vehicles` | `id`（uuid）, `user_id`, `name`, `type`（`car` / `bike`）, `created_at` | `type` は CHECK 制約 |
| `fuel_records` | `id`（uuid）, `user_id`, `vehicle_id`（uuid、null 可）, `date`, `total_distance`, `fuel_amount`, `total_cost`, `price_per_unit`, `fuel_efficiency`, `gas_station`, `created_at` | `total_distance` はトリップメーターの区間距離 |
| `keepalive` | `id`（常に 1）, `last_ping`, `source` | 自動停止対策のハートビート（`0002`）。アプリからは触らない |

- 外部キーはすべて `ON DELETE CASCADE` です（`fuel_records.vehicle_id` → `vehicles`、`vehicles.user_id` / `fuel_records.user_id` → `users`）。
- `fuel_efficiency` と `price_per_unit` は、保存時にクライアントが `calculateFuelMetrics` で計算した値です
  （燃費は小数第 2 位、単価は整数円に丸める）。

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
`addVehicle(name, type)`, `addVehicles(items)`, `updateVehicle(id, name, type)`, `deleteVehicle(id)`, `refreshVehicles()`。

- ログイン中は読み込みのたびに `migrateLocalData` → `ensureDefaultVehicle` の順に実行します。
- 読み込みに失敗したときはローカルの既定車両へフォールバックせず、最後に同期した一覧（キャッシュ）を表示します。
- `addVehicles(items: { name, type }[])`（復元用）は車両をまとめて追加し、作成した `Vehicle[]` を返します。
  未ログインでは `local-vehicle-<時刻>-<連番>` の ID でローカルに追加し、ログイン中は 1 回の insert で追加します（閲覧専用中は日本語エラー）。

### `useFuelRecords(selectedVehicleId?, defaultVehicleId?, { enabled? })`（`lib/useFuelRecords.ts`）

戻り値: `records`（日付の降順）, `loading`, `error`, `outage`, `readOnly`, `addRecord`, `addRecords(items, { onProgress })`, `updateRecord`, `deleteRecord`, `fetchAllRecords()`, `refresh()`。

- 呼び出し側は `defaultVehicleId` に `vehicles[0]?.id`、`enabled` に `!vehiclesLoading` を渡します。
- ログイン中は `selectedVehicleId` が UUID になるまでクエリを発行しません。
- 車両削除などで記録が別経路から変わると、`fuel_records_changed` イベントで再読み込みします。
- `addRecords(items, { onProgress })`（復元用）は、選択中の車両で絞らず、各記録の `vehicle_id` のまま一括追加して追加件数を返します。
  未ログインでは `restored-<時刻>-<連番>` の ID でローカルに追記します。ログイン中は 100 件ずつ挿入し、
  `vehicle_id` が UUID でない記録があれば挿入前に日本語エラーを投げます。途中で失敗したときは
  「N 件を追加したところで中断しました。」を先頭に付けたメッセージを投げます（追加済みの分は残る）。完了後に `fuel_records_changed` を発火します。
- `fetchAllRecords()` は全車両の記録を日付の降順で返します（`useCallback` で安定。バックアップ・全車両 CSV・重複判定用）。
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
- 単価と燃費は `calculateFuelMetrics` で入力に追従して再計算します。
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
| CSV | `fuellens_all_YYYY-MM-DD.csv` | 全車両の記録を 1 つにまとめた閲覧用。列は車両・日付・給油量・支払総額・単価・走行距離・燃費・店舗名。復元には使えない |

- JSON は `{ app: "fuel-lens", version: 1, exportedAt, vehicles, records }` の形式です（スキーマバージョン 1）。
  `vehicles` は `id` / `name` / `type` / `created_at` で、**`user_id` は含めません**。`records` は `FuelRecord` の列
  （`id` / `date` / `total_distance` / `fuel_amount` / `gas_station` / `price_per_unit` / `total_cost` / `fuel_efficiency` / `vehicle_id` / `created_at`）です。
- 書き出し時に `buildBackup` が値を正規化します（不正な数値は null、不正な日付は `created_at` の日付か書き出し日、id の重複は先勝ち）。
  古いローカルデータの欠損で、自分のバックアップが復元できなくなるのを防ぐためです。記録は日付の昇順に並べます。
- CSV は先頭に UTF-8 の BOM を付け、`=` `+` `-` `@` などで始まる文字列には `'` を付けて数式として実行されないようにします（CSV インジェクション対策）。
  未分類の記録は、既定車両（`vehicles[0]`）の名前で出力します。記録が 0 件のときは書き出しません。

### 復元

復元は **追記のみ** です。既存の車両・記録は削除も上書きもしません。

1. ファイルを選ぶと `parseBackup` が検証します。バックアップは利用者が編集できる信頼できない入力なので、形・型・値域・件数を厳密に確認し、
   既知のキーだけを取り出した新しいオブジェクトを使います。上限は車両 500 台・記録 50,000 件・30MB です。
   `app` が `fuel-lens` でない、`version` が 1 でない（新しい版を含む）、ID の重複、不正な日付・数値などは日本語メッセージで拒否します。
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
