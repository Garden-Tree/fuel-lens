# 今後の候補と既知の制約

実装の候補（バックログ）と、現時点のコードで確認できる制約をまとめます。
規模は S（1 日程度まで）/ M（数日）/ L（1 週間以上）の目安です。変更ファイルは想定であり、確定ではありません。

## 実装済み

| 項目 | 実装日 | 内容 |
|---|---|---|
| バックアップと復元（`/settings`） | 2026-10-04 | 全車両・全記録の JSON バックアップ、追記のみの復元（件数プレビュー付き）、全車両 CSV の書き出し。詳細は [architecture.md 8 章](./architecture.md#8-バックアップと復元) |
| PWA の基本（manifest、アイコン、ショートカット） | 2026-10-04 | ホーム画面に追加でき、「スキャン」「手動で入力」のショートカットを持つ。詳細は [architecture.md 9 章](./architecture.md#9-pwa) |
| インポート（Fuelio CSV / FuelLens CSV。`/settings`） | 2026-10-05 | Fuelio の CSV（`Odo` / `Full` / `Missed` / `FuelType` / `Notes` を新しい列に取り込み、区間距離と燃費は連鎖計算が導出）と FuelLens の全車両・車両別 CSV を、復元と同じ重複判定で追記のみ取り込む。詳細は [architecture.md 8 章](./architecture.md#インポートcsv) |
| オドメーターモード | 2026-10-07 | 車両ごとに「トリップメーター / オドメーター」を選べる。オドメーター車両は `odometer` を保存し、前回との差分から区間距離を導出する（満タン法の分子は区間距離のまま）。詳細は [design-fill-chain.md](./design-fill-chain.md) |
| 部分給油フラグ（記録漏れを含む） | 2026-10-07 | `is_full` で部分給油を区別し、次の満タン給油までの距離と給油量を合算して燃費を出す。`missed_previous` で記録し忘れの区間の連鎖を切る。計算は `lib/fillChain.ts` の `applyFillChain` |
| 燃料種別とメモ | 2026-10-07 | 記録に燃料種別（レギュラー / ハイオク / 軽油 / その他）と 200 文字までのメモ、車両に既定の燃料種別を追加。マイグレーションは `supabase/migrations/0004_fill_chain.sql` |
| 単価トレンド（`/stats`） | 2026-10-08 | 単価の推移グラフ（期間の平均線、前回比・30 日 / 90 日平均比）を表示する。スタンド別の平均単価の比較（店舗名のゆれを `lib/stations.ts` で吸収してまとめる。上位 8 件、2 回以上給油したスタンドどうしの「最安」）も作ったが、同日に画面から外した。部品と計算・テストは残してある。詳細は [architecture.md 11 章](./architecture.md#11-統計) |
| Web Share Target（Android の共有メニューから写真をスキャンへ） | 2026-10-08 | `public/sw.js` が POST /share を端末内で受け取り IndexedDB 経由で `/app?action=shared` に渡す。サーバーには送らない |
| データアダプタ層（`lib/data/`） | 2026-10-08 | 記録・車両の保存先を `RecordStore` / `VehicleStore` に切り出し、localStorage 版とクラウド版が同じインターフェースを満たす。障害・閲覧専用・キャッシュは `withOutageHandling` / `withCache` が受け持ち、フックは状態・楽観更新・連鎖計算・イベントだけを扱う。詳細は [architecture.md 2 章](./architecture.md#データアダプタ層libdata) |
| オドメーター → トリップ切替時の区間距離の書き戻し | 2026-10-08 | 車両の方式をオドメーターからトリップに切り替えるとき、連鎖計算で導出した区間距離を記録の `total_distance` に書き戻す（`planDistanceWriteBack`）。詳細は [design-fill-chain.md 4 章](./design-fill-chain.md#車両管理モーダル) |
| スマホ幅（375〜430px）のレイアウト整理 | 2026-10-09 | 狭い画面での各画面のレイアウトを整理した |

## 今後の候補

### データの出し入れ

| 候補 | 利用者にとっての価値 | 規模 | 主な変更ファイル |
|---|---|---|---|
| 旧レシートの一括アップロード | 溜まったレシート写真をまとめて登録できる。レートリミット（1 分 5 回）に合わせて順に解析し、確認シートを順番に表示する | M | `lib/scan/useScanPipeline.ts`、`app/app/_components/ScanPanel.tsx`、`components/ScanReviewSheet.tsx`（キュー対応） |

### 統計と通知

| 候補 | 利用者にとっての価値 | 規模 | 主な変更ファイル |
|---|---|---|---|
| 車両比較と月次コストの積み上げ | 複数車両の燃費・支出を並べて比較し、月次コストを車両別に積み上げて表示する | M | `app/stats/page.tsx`、`lib/stats/`（`buildStatsModel`）、`lib/useFuelRecords.ts`（全車両の取得は `fetchAllRecords` を利用できる） |
| 月次予算 | 月ごとの燃料費の予算に対する進み具合が分かる | S | `lib/stats/`（`buildMonthlyCostSeries` を利用）、`app/stats/page.tsx`、予算の保存先 |
| 整備リマインダー | オイル交換などの時期を距離・日付で知らせる | M | 新規テーブルとマイグレーション（RLS ポリシーを追加したら [supabase/README.md](../supabase/README.md#2-rls-が有効か確認する) の監査対象一覧も更新）、新規画面 |

### 基盤・運用

| 候補 | 利用者にとっての価値 | 規模 | 主な変更ファイル |
|---|---|---|---|
| オフラインキュー | 電波の悪い場所でも撮影・手動入力を溜めておき、復帰後に解析・同期できる | M | `public/sw.js`（現状は共有の受け取りのみ、キャッシュなし）、`lib/scan/useScanPipeline.ts`、`lib/data/`（書き込みのキュー） |
| Supabase Realtime / 画面表示時の再取得 | 他の端末やタブでの変更が自動で反映される。表示時の再取得は S、Realtime は M | S / M | `lib/useFuelRecords.ts`、`lib/useVehicles.ts` |
| アカウント削除 + Clerk webhook + プライバシーポリシー | 利用者が自分のデータを削除できる。Clerk の `user.deleted` を webhook で受けて `users` 行を削除し（外部キーの `ON DELETE CASCADE` で車両・記録も削除）、画像を Gemini に送ることなどをプライバシーポリシーに明記する | S–M | 新規 webhook ルート（service_role キーを使用）、新規プライバシーポリシーページ、ランディングページ |
| Clerk 本番インスタンスへの移行（運用） | 本番を開発インスタンスから切り替え、公開に耐える構成にする。本番インスタンスの作成、ドメインの DNS 設定、JWT テンプレート `supabase` の再作成、Vercel の Production に本番キーを設定。開発インスタンスのユーザーは自動では引き継がれず userId も変わるため、既存データの `user_id` の扱いを決める | 運用 | コード変更なし（Clerk / Vercel のダッシュボード、必要なら `user_id` を付け替える SQL） |
| Clerk ネイティブ Third-Party Auth への移行 | Supabase の JWT Secret を Clerk に共有しなくてよくなる（[architecture.md 7 章](./architecture.md#7-認証)） | S | `lib/supabaseClient.ts`（`getToken()` に変更）、Clerk / Supabase のダッシュボード |
| E2E テストの追加 | 画面をまたぐ回帰を防ぐ。Playwright で `/api/analyze` をモックし、スキャン → 確認 → 保存 → 履歴の流れを検証する（コンポーネントテストは `tests/components/` にあり、未対応の画面は追加で拡充） | M | `package.json`、新規 `e2e/`、`.github/workflows/ci.yml` |
| Sentry / Vercel Analytics | 本番のエラーと利用状況を把握できる（`/api/analyze` の `requestId` と突き合わせられる） | S | `app/layout.tsx`、`app/error.tsx`、`app/global-error.tsx`、`package.json` |

## 既知の制約

- `/api/analyze` のレートリミット（1 分 5 回）と匿名お試し回数（3 回）は、サーバーインスタンスのメモリ上のカウンタです。
  サーバーレス環境ではインスタンスごとに別々で、コールドスタートで消えます。厳密な制限には外部ストアが必要です。
- GitHub Actions の keepalive は anon キーを使います。anon が実行できるのは `keepalive_ping()` だけで
  （3 テーブルの権限は revoke 済み）、10 分のスロットルがあります。
- `SUPABASE_SERVICE_ROLE_KEY` を設定していない場合、`/api/keepalive` の件数（`counts`）は `null` になります（想定どおり）。
- AI はオドメーターも読み取ります。オドメーターモードの車両では確認シートのオドメーター欄に入れて保存しますが、トリップモードの車両では参考表示するだけで保存しません。
- 単価は 0.1 円単位に丸めて保存します（`lib/calculations.ts`）。
- スタンド別の平均単価の集計（`lib/stats/prices.ts` の `summarizeStations`、画面からは外し済み）は、店舗名の表記ゆれ（全角・半角、会社名、ブランドの別名、「セルフ」、末尾の「店」など）だけを吸収します。略称や別の地名で記録された同じスタンドはまとめられず、ブランドの判定も `lib/stations.ts` の小さな辞書に載っているものだけです。画面に戻す場合もこの制約が残ります。
- 燃費は連鎖計算（[architecture.md 10 章](./architecture.md#10-給油の連鎖計算fill-chain)）で読み取り時に導出します。部分給油の記録は燃費が null で、次の満タン給油にまとめて計算されます。
  オドメーターモードでは、先頭の記録、前回の記録にオドメーターが無い記録、`missed_previous` の記録は区間距離が分からず燃費も null になります（トリップ → オドメーターに切り替えても既存の記録は書き換えないので、切り替え直後は `odometer` の無い記録が該当します）。
  逆にオドメーター → トリップに切り替えるときは、導出した区間距離を `total_distance` に書き戻します（[design-fill-chain.md 4 章](./design-fill-chain.md#車両管理モーダル)）。書き戻した値は保存時点のもので、後から前後に記録を足しても更新されません。区間が出ない記録の保存値は残します。
- 履歴・統計・履歴画面の CSV 出力は選択中の車両単位です（全車両の CSV 出力は設定画面にあります。全車両を横断した集計はありません）。
- 取り込みは FuelLens の JSON バックアップの復元と、Fuelio / FuelLens の CSV のインポートです（どちらも追記専用）。Fuelio の給油以外の記録（`## Costs` など）、マイル・ガロン単位の CSV、その他のアプリの CSV には対応していません。
- Service Worker は Web Share Target の受け取り専用でキャッシュを持たず、オフラインでは動作しません。Web Share Target は Android Chrome のみ（iOS は非対応）。
- 未ログイン時のデータはそのブラウザの localStorage にだけあり、端末間で共有されません。
- 他のタブや端末での変更は、再読み込みするまで反映されません（障害中の自動再試行を除く）。
- 障害（一時停止・接続不可）は、ログイン中に Supabase へアクセスしたときにだけ検知されます。
- Clerk のトークン取得失敗が確定するまで、postgrest-js の再試行により最長 7 秒ほどかかります。
- Vercel Hobby の Cron は 1 日 1 回、実行時刻に ±59 分のずれがあり、本番デプロイでしか動きません。
- テストは Vitest の 2 プロジェクトです。`lib/` の関数の単体テストは `environment: "node"`（`tests/**/*.test.ts`）、
  主要なコンポーネントのテストは jsdom + Testing Library（`tests/components/**/*.test.tsx`）で、全画面は網羅していません。E2E テストはありません。
