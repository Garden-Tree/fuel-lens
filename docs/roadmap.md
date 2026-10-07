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

## 今後の候補

### データの出し入れ

| 候補 | 利用者にとっての価値 | 規模 | 主な変更ファイル |
|---|---|---|---|
| 旧レシートの一括アップロード | 溜まったレシート写真をまとめて登録できる。レートリミット（1 分 5 回）に合わせて順に解析し、確認シートを順番に表示する | M | `app/app/page.tsx`、`components/ScanReviewSheet.tsx`（キュー対応） |

### 記録と計算

| 候補 | 利用者にとっての価値 | 規模 | 主な変更ファイル |
|---|---|---|---|
| 単価トレンドとスタンド比較 | 単価の推移とスタンドごとの比較ができる。単価を 0.1 円精度にし、店舗名をブランド単位に正規化する | S–M | `lib/calculations.ts` と `lib/analyze.ts` の `derivePricePerUnit`（丸めを両方揃える）、`lib/stats.ts`、`app/stats/page.tsx` |

### 統計と通知

| 候補 | 利用者にとっての価値 | 規模 | 主な変更ファイル |
|---|---|---|---|
| 車両比較と月次コストの積み上げ | 複数車両の燃費・支出を並べて比較し、月次コストを車両別に積み上げて表示する | M | `app/stats/page.tsx`、`lib/stats.ts`、`lib/useFuelRecords.ts`（全車両の取得） |
| 月次予算 | 月ごとの燃料費の予算に対する進み具合が分かる | S | `lib/stats.ts`（`buildMonthlyCostSeries` を利用）、`app/stats/page.tsx`、予算の保存先 |
| 整備リマインダー | オイル交換などの時期を距離・日付で知らせる | M | 新規テーブルとマイグレーション（RLS ポリシーを追加したら [supabase/README.md](../supabase/README.md#2-rls-が有効か確認する) の監査対象一覧も更新）、新規画面 |

### 基盤・運用

| 候補 | 利用者にとっての価値 | 規模 | 主な変更ファイル |
|---|---|---|---|
| PWA の続き（Web Share Target、オフラインキューと Service Worker） | 写真アプリの共有メニューから直接スキャンできる（Web Share Target）。電波の悪い場所でも手動入力を溜めておき、復帰後に同期できる（オフラインキュー） | M | 新規 Service Worker、`app/manifest.ts`（`share_target`）、`app/app/page.tsx`（共有画像の受け取り）、`lib/useFuelRecords.ts`（キュー） |
| Supabase Realtime / 画面表示時の再取得 | 他の端末やタブでの変更が自動で反映される。表示時の再取得は S、Realtime は M | S / M | `lib/useFuelRecords.ts`、`lib/useVehicles.ts` |
| アカウント削除 + Clerk webhook + プライバシーポリシー | 利用者が自分のデータを削除できる。Clerk の `user.deleted` を webhook で受けて `users` 行を削除し（外部キーの `ON DELETE CASCADE` で車両・記録も削除）、画像を Gemini に送ることなどをプライバシーポリシーに明記する | S–M | 新規 webhook ルート（service_role キーを使用）、新規プライバシーポリシーページ、ランディングページ |
| Clerk 本番インスタンスへの移行（運用） | 本番を開発インスタンスから切り替え、公開に耐える構成にする。本番インスタンスの作成、ドメインの DNS 設定、JWT テンプレート `supabase` の再作成、Vercel の Production に本番キーを設定。開発インスタンスのユーザーは自動では引き継がれず userId も変わるため、既存データの `user_id` の扱いを決める | 運用 | コード変更なし（Clerk / Vercel のダッシュボード、必要なら `user_id` を付け替える SQL） |
| Clerk ネイティブ Third-Party Auth への移行 | Supabase の JWT Secret を Clerk に共有しなくてよくなる（[architecture.md 7 章](./architecture.md#7-認証)） | S | `lib/supabaseClient.ts`（`getToken()` に変更）、Clerk / Supabase のダッシュボード |
| テスト拡充 | フォーム・シートの回帰を防ぐ。jsdom + Testing Library でフォームと確認シート、Playwright で `/api/analyze` をモックした E2E | M | `vitest.config.mts`、`package.json`、`tests/`、`.github/workflows/ci.yml` |
| Sentry / Vercel Analytics | 本番のエラーと利用状況を把握できる（`/api/analyze` の `requestId` と突き合わせられる） | S | `app/layout.tsx`、`app/error.tsx`、`app/global-error.tsx`、`package.json` |

## 既知の制約

- `/api/analyze` のレートリミット（1 分 5 回）と匿名お試し回数（3 回）は、サーバーインスタンスのメモリ上のカウンタです。
  サーバーレス環境ではインスタンスごとに別々で、コールドスタートで消えます。厳密な制限には外部ストアが必要です。
- GitHub Actions の keepalive は anon キーを使います。anon が実行できるのは `keepalive_ping()` だけで
  （3 テーブルの権限は revoke 済み）、10 分のスロットルがあります。
- `SUPABASE_SERVICE_ROLE_KEY` を設定していない場合、`/api/keepalive` の件数（`counts`）は `null` になります（想定どおり）。
- 確認シート・車両管理モーダル・確認ダイアログには初期フォーカスと Escape での閉じる操作はありますが、
  フォーカストラップはありません（Tab キーでダイアログの外へフォーカスが移る）。
- AI はオドメーターも読み取ります。オドメーターモードの車両では確認シートのオドメーター欄に入れて保存しますが、トリップモードの車両では参考表示するだけで保存しません。
- 単価は 0.1 円単位に丸めて保存します（`lib/calculations.ts`）。
- 燃費は連鎖計算（[architecture.md 10 章](./architecture.md#10-給油の連鎖計算fill-chain)）で読み取り時に導出します。部分給油の記録は燃費が null で、次の満タン給油にまとめて計算されます。
  オドメーターモードでは、先頭の記録、前回の記録にオドメーターが無い記録、`missed_previous` の記録は区間距離が分からず燃費も null になります（方式を切り替えても既存の記録は消さないので、切り替え直後は `odometer` の無い記録が該当します）。
- 履歴・統計・履歴画面の CSV 出力は選択中の車両単位です（全車両の CSV 出力は設定画面にあります。全車両を横断した集計はありません）。
- 取り込みは FuelLens の JSON バックアップの復元と、Fuelio / FuelLens の CSV のインポートです（どちらも追記専用）。Fuelio の給油以外の記録（`## Costs` など）、マイル・ガロン単位の CSV、その他のアプリの CSV には対応していません。
- PWA に Service Worker はなく、オフラインでは動作しません（ホーム画面への追加とショートカットのみ）。
- 未ログイン時のデータはそのブラウザの localStorage にだけあり、端末間で共有されません。
- 他のタブや端末での変更は、再読み込みするまで反映されません（障害中の自動再試行を除く）。
- 障害（一時停止・接続不可）は、ログイン中に Supabase へアクセスしたときにだけ検知されます。
- Clerk のトークン取得失敗が確定するまで、postgrest-js の再試行により最長 7 秒ほどかかります。
- Vercel Hobby の Cron は 1 日 1 回、実行時刻に ±59 分のずれがあり、本番デプロイでしか動きません。
- 単体テストは `lib/` の関数のみが対象（`environment: "node"`）で、UI のテストと E2E テストはありません。
