# 設計: オドメーターモード・部分給油・メモと燃料種別

実装の前提となる仕様。ここに書かれたルールが `lib/fillChain.ts` の正本であり、UI・インポート・ドキュメントはこれに従う。

## 1. 追加するデータ

### fuel_records（記録）

| 列 | 型 | 既定 | 意味 |
|---|---|---|---|
| `odometer` | numeric null | null | 給油時の積算距離（km）。オドメーターモードの車両では必須入力 |
| `is_full` | boolean | true | 満タン給油か。false なら「部分給油」 |
| `missed_previous` | boolean | false | この給油の前に記録し忘れた給油がある（Fuelio の Missed）。区間が信頼できないので連鎖を切る |
| `fuel_type` | text null | null | `regular` / `premium` / `diesel` / `other`。null は未指定 |
| `memo` | text null | null | 自由記述（200 文字まで） |

既存列 `total_distance`（区間距離）と `fuel_efficiency` はそのまま残す。トリップモードでは `total_distance` が入力値。
オドメーターモードでは `total_distance` は導出値（保存もするが、読み取り時に必ず再計算して上書きする）。

### vehicles（車両）

| 列 | 型 | 既定 | 意味 |
|---|---|---|---|
| `distance_mode` | text | `'trip'` | `trip`（トリップメーターの区間距離を入力）か `odometer`（積算距離を入力し差分で区間を出す） |
| `default_fuel_type` | text null | null | 新規記録の燃料種別の初期値 |

マイグレーションは `supabase/migrations/0004_fill_chain.sql`（冪等、`add column if not exists`、CHECK は `not valid`）。

## 2. 連鎖計算（fill chain）

車両ごとに、記録を **日付昇順 → オドメーター昇順 → created_at 昇順 → id** で並べ、先頭から順に次を決める。
実装は純粋関数 `applyFillChain(records, vehicle): FuelRecord[]`（`lib/fillChain.ts`）。入力は変更せず、
`total_distance`（オドメーターモードのみ）と `fuel_efficiency` を上書きした新しい配列を返す。

### 区間距離 `distance_i`

- トリップモード: 入力された `total_distance_i`（null 可）。
- オドメーターモード: `odometer_i − odometer_base`。`base` は **それまでの記録で見た最大のオドメーター**（running max）。
  次のいずれかなら null: 先頭の記録、`odometer_i` が null、`base` が無い、`odometer_i ≤ base`、`missed_previous_i` が true。
  `odometer_i ≤ base` の記録（打ち間違いで値が戻った行）は base を更新しない。これにより 1000 → 1300 → 130 → 1600 の並びは
  null / 300 / null / 300 になり、戻った行の次の区間が膨らまない。
- オドメーターモードで `missed_previous_i` が true なら `distance_i = null`（区間が信頼できない）。base は `odometer_i > base` なら進む。
  進められなかった（odometer が null か base 以下の）場合、次の記録は先頭扱い（距離 null、base をその値にする）。
- トリップモードで `missed_previous_i` が true のときは、入力した `total_distance_i` は **保持**し（編集時に消さない）、燃費だけ null にする。
- オドメーターモードで記録の編集・スキャン保存時はオドメーター未入力を許容する（距離 null の持ち越し行になる）。
  必須なのは新規の手動入力のみ。

### 持ち越し行（carry row）

オドメーターモードで、`odometer_i` が null か `odometer_i ≤ base` のために区間が出せなかった記録（`missed_previous` ではない）を
「持ち越し行」と呼ぶ。base は進まないので、次に区間が出た記録の距離は持ち越し行の分も含んでいる。したがって持ち越し行は
**run を切らず**、自身の燃費は null、給油量は run に積み上げる（部分給油と同じ扱い）。
例: A(1000 km, 30 L) → B(odometer なし, 20 L) → C(1600 km, 20 L) は、C の区間 600 km、燃費 600 ÷ (20 + 20) = 15.00。
1000 → 1300 → 130 → 1600（各 20 L）は null / 15.00 / null / 300 ÷ 40 = 7.50。

### 燃費 `fuel_efficiency_i`

「走行区間（run）」= 直前の満タン給油の次の記録から i まで。run が切れるのは次の 2 つだけ:
`missed_previous` が true の記録、トリップモードで区間距離が null の記録。
**切った記録自身は新しい run に含めない**（新しい run はその次の記録から始まる）。記録漏れ行の燃料は不明な区間に属するので持ち越さない。
例: 5000 → 5200 → 5300(記録漏れ, 1.5 L) → 5500(4.0 L) は、5300 の燃費 null、5500 は区間 200 km（基準は 5300）、燃費 200 ÷ 4.0 = 50.00。
持ち越し行では run は切れない。

- `is_full_i` が false（部分給油）: `fuel_efficiency_i = null`。距離と給油量は run に積み上がる。
- `is_full_i` が true: run 内のすべての記録で `distance` が非 null かつ `fuel_amount` が非 null かつ Σfuel > 0 のとき
  `Σdistance / Σfuel` を小数 2 桁に丸める。それ以外は null。
- 部分給油も満タン給油も無い通常のトリップモード（全件 `is_full = true`、`missed_previous = false`）では
  `distance_i / fuel_amount_i` と一致する（従来の計算と同じ）。

### 単価と満タン判定に無関係なもの

`price_per_unit` は従来どおり `total_cost / fuel_amount`（0.1 円丸め）。`fuel_type` と `memo` は計算に関与しない。

## 3. 読み取りと書き込みの責務

- **読み取り**: `useFuelRecords` は読み込み後（local / cloud とも）に `applyFillChain` を適用した結果を state に置く。
  `fetchAllRecords` も車両ごとにグループ化して適用する。したがって UI・統計・CSV・バックアップが見る値は常に導出値。
- **書き込み**: フォームは自分の記録について導出可能な値（トリップモードの `fuel_efficiency`、単価）を計算して保存する。
  隣接する記録の保存値が古くなっても、読み取り時の再計算で正しく表示されるので DB を追いかけて更新しない。
- **統計**: 平均燃費（Σkm/ΣL）と走行コスト（円/km）は **満タン給油で閉じた run 単位** で集計する（`lib/stats.ts` の `summarize`）。
  記録ごとに「距離と給油量の両方がある記録」を拾うと、持ち越し行・部分給油の分が分子と分母で別の区間に入って値が歪むため
  （例: A(1000 km, 30 L) → B(odometer なし, 20 L, 3,000 円) → C(1600 km, 20 L, 3,000 円) は、記録ごとだと C の 600 km ÷ 20 L = 30 になるが、
  run 単位では 600 ÷ 40 = 15.00、円/km は 6,000 ÷ 600 = 10）。
  `applyFillChain` は燃費が出た記録（run を閉じた満タン給油）にだけ、導出値 `run_distance`（run の Σ区間距離）・`run_fuel`（Σ給油量）・
  `run_cost`（Σ支払総額。run 内に支払総額の無い記録があれば null）を付ける。これらは **保存しない**
  （`pickRecordColumns`・移行・バックアップ・CSV は既知の列だけを書くので含まれない）。
  - 平均燃費 = Σ`run_distance` ÷ Σ`run_fuel`（run の距離と給油量が正のもの）
  - 円/km = Σ`run_cost` ÷ Σ`run_distance`（`run_cost` が null でない run）
  - 平均単価（Σ支払総額 ÷ Σ給油量）、総走行距離・総給油量・総支払額、燃費の単純平均（参考値）は従来どおり記録ごと。
    部分給油・持ち越し行の距離と給油量も合計に含める（燃費 null でも除外しない）
  - 全件が満タンのトリップモードでは各記録が 1 件の run なので、従来の記録ごとの集計と同じ値になる
  - 期間で絞り込んだ場合、run を閉じた記録が期間内なら、その run 全体（期間より前の部分給油・持ち越し行を含む）を数える

## 4. UI

### 車両管理モーダル

- 距離の入力方式: 「トリップメーター（区間距離）」/「オドメーター（積算距離）」のトグル。既定はトリップ。
- 既定の燃料種別: 未指定 / レギュラー / ハイオク / 軽油 / その他。
- 方式を切り替えても既存データは消さない。オドメーターに切り替えた直後は `odometer` が無い記録の区間が null になる旨を一行で注意。

### 入力フォーム（手動・編集・確認シート共通 `EditFuelRecordForm` + `useRecordForm`）

- トリップモード: 走行距離（区間）入力（従来どおり）。オドメーターは任意の補助入力として表示しない（シンプルさ優先）。
- オドメーターモード: 「オドメーター (km)」を主入力にし、走行距離欄は「前回から ○○ km（自動計算）」の読み取り専用表示。
  前回記録のオドメーターをフォームに渡し、ライブで差分と燃費を表示する。
- 共通: 「満タン給油」トグル（既定 on）、「前回の給油を記録し忘れた」チェック（既定 off、折りたたみの詳細欄でよい）、
  燃料種別セレクト（車両の既定値を初期値に）、メモ（任意、200 文字）。
- 部分給油のときは燃費欄に「次の満タン給油でまとめて計算」と表示。
- 満タン給油の燃費プレビューは、直前に開いている run（`openRunBefore`）の部分給油の分を合算した値（保存後と同じ）にし、「部分給油・持ち越し n 件分と合算」と添える。
  オドメーターモードで記録漏れにチェックしたときは、区間距離は計算せず（null）「記録漏れのため区間距離は計算しません」と表示する。

### 確認シート（スキャン後）

- `/api/analyze` の `odometer` を、オドメーターモードの車両ではオドメーター欄に入れる。トリップモードでは従来どおり参考表示。
- `/api/analyze` に `fuel_type` を追加（レシートの「レギュラー／ハイオク／軽油」を読む）。読めたら初期値にする。

### 履歴カード

- バッジ: 部分給油（`is_full=false`）、記録漏れ（`missed_previous=true`）、燃料種別（略称: レギュラー/ハイオク/軽油/その他）。
- オドメーターモードの車両は「ODO 12,345 km」と区間距離の両方を表示。
- メモがあれば 1 行で表示（長ければ省略）。
- 燃費 null の理由を短く示す（部分給油 / 区間不明）。

## 5. 周辺機能

- **移行（`migrateLocalData.ts`）**: 送信列のホワイトリストに新列を追加。
- **バックアップ（`lib/backup.ts`）**: 新フィールドを書き出し・検証する。`version` は 2 に上げ、1 も読み込める（欠けたフィールドは既定値）。
  車両の `distance_mode` / `default_fuel_type` も含める。
- **CSV（`lib/csv.ts`）**: 全車両 CSV と履歴 CSV に列を追加: オドメーター(km)、満タン、記録漏れ、燃料種別、メモ。
  FuelLens CSV インポートは新列を読み、無ければ既定値。
- **Fuelio インポート**: `Odo` → `odometer`、`Full` → `is_full`、`Missed` → `missed_previous`、`FuelType` → `fuel_type`
  （Fuelio のコードは番号。既知の対応が無ければ `other`）、`Notes` → `memo`（店舗名としての流用はやめる）。
  区間距離と燃費は `applyFillChain` に任せ、インポータ側の独自計算は削除する。取り込み先の車両が新規なら `distance_mode = 'odometer'` にする。
- **解析 API**: `fuel_type` を構造化出力に追加。許可値は上記 4 つ。

## 6. 互換性

- 既存の記録は `is_full = true`、`missed_previous = false`、`odometer = null` として扱われ、トリップモードの車両では表示も計算も変わらない。
- 既存のテスト（`calculateFuelMetrics` など）は変更しない。`applyFillChain` の単体テストを追加する。
