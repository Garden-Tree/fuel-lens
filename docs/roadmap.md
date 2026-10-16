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
| アカウント削除（`/settings` の「アカウント」） | 2026-10-14 | 利用者が設定画面からアカウントとクラウドのデータを削除できる。データは利用者自身の JWT（RLS）で記録 → 車両 → `users` 行の順に削除して 0 件を確認し、Clerk のユーザーは `DELETE /api/account` で削除する。アプリ内で完結するため、当初の案の Clerk webhook（`user.deleted`）と service_role キーは不要になった。未ログインでは「この端末のデータをすべて削除」。Clerk のダッシュボードからユーザーを削除したときは DB の行が残るので、[supabase/README.md 5 章](../supabase/README.md#5-ユーザーのデータを手作業で削除する)の SQL で消す。詳細は [architecture.md](./architecture.md#アカウント削除) |
| 画面に戻ったときの再取得 | 2026-10-14 | ログイン中、10 秒以上離れていた画面に戻ると（`visibilitychange`、予備に `focus`）車両と記録の一覧を裏で読み直し、他の端末・タブでの変更を反映する。30 秒に 1 回まで、オフライン・障害中は行わない。スケルトンは出さず、失敗しても表示中の一覧を残す。詳細は [architecture.md 4 章](./architecture.md#画面に戻ったときの再取得両フック共通libusereturnrefreshts) |
| 燃費計算ページ（`/calc`） | 2026-10-14 | ログイン不要の満タン法の燃費計算ツール（走行距離・給油量・任意の支払総額から燃費・単価・1km あたりの燃料費。計算は `calculateFuelMetrics`、入力は保存しない）と、満タン法の解説・よくある間違い・FAQ（JSON-LD の `WebApplication` + `FAQPage`）。検索からの入口で、アプリ（`/app`）へ誘導する。ランディングのフッターと機能紹介からリンク。詳細は [architecture.md](./architecture.md#燃費計算ページcalc) |
| 燃費計算の結果をアプリに記録（`/calc` → `/app`） | 2026-10-15 | `/calc` の結果の下の「この内容で FuelLens に記録する」で、アプリの手動入力を区間距離・給油量・支払総額を入れた状態で開く（`/app?action=manual&distance=…&amount=…&cost=…`）。自動では保存せず、日付・車両を確認して通常どおり保存する。オドメーターモードの車両では区間距離を入れない。詳細は [architecture.md](./architecture.md#燃費計算ページcalc) |
| 未ログインのお試し読み取り | 2026-10-16 | ログインしなくても AI スキャンを端末（ブラウザ）ごとに 3 回まで試せる。`TRIAL_COOKIE_SECRET` を設定したときだけ有効（未設定なら従来どおり 401）。回数は HMAC 署名付きの HttpOnly Cookie（`fuel_lens_trial`、180 日）で数え、成功時だけ加算。乱用対策に IP ごとに 1 日 10 回の上限（429 `TRIAL_IP_LIMITED`）。使い切ると 401 `TRIAL_EXHAUSTED` とログインの案内。結果はこのブラウザに保存し、ログイン時に移行する。開発・デモ用だった `ALLOW_ANONYMOUS_SCAN`（IP ごと 3 回）はこれに置き換えて廃止。詳細は [api-analyze.md](./api-analyze.md#未ログインのお試し読み取り) |
| ランディングの検索向けメタデータ | 2026-10-15 | トップ（`/`）に独自のタイトル（「燃費管理アプリ」など）・説明・canonical・OG と `WebApplication` の構造化データを付けた（`lib/landingPage.ts`） |
| ガソリン代計算ページ（`/gas-cost`） | 2026-10-15 | ログイン不要のガソリン代計算ツール（走行距離・燃費・単価から必要なガソリン量・ガソリン代・1km あたりのガソリン代、往復と割り勘の 1 人あたりにも対応。入力は保存しない）と、計算式・正確に出すコツ・FAQ（JSON-LD の `WebApplication` + `FAQPage`）。`/calc` とランディングのフッターからリンク。詳細は [architecture.md](./architecture.md#ガソリン代計算ページgas-cost) |
| Sentry エラー監視 | 2026-10-14 | 導入済み（[operations.md 4-3](./operations.md)）。本番は Vercel に `NEXT_PUBLIC_SENTRY_DSN` を設定すると有効。`/api/analyze` の 500 は `requestId` タグ付き |
| 旧レシートの一括アップロード（写真の一括読み取り） | 2026-10-15 | アルバム（複数選択）・ドロップ・ペーストで 3 枚以上の写真を選ぶと（ちょうど 2 枚なら「レシートとメーターの組」か「2件の給油として一括」かを選ぶ）、1 枚ずつ「圧縮 → 解析 → 確認シート」を順に表示する（上限 20 枚、確認中に次の 1 枚を先読み）。回数制限（1 分 5 回）に合わせてクライアントでペース配分し、429 は Retry-After だけ待って自動で再試行する（「あと N 秒待っています」）。日付が読めなければ今日を入れずに入力を求め、同じ日付・金額の記録があれば注意を出す。終わったら「12 枚中 9 件を保存、3 件をスキップしました」。見送り: キューの永続化（再読み込みで消える）、共有（Web Share Target）からの複数枚、画面を離れたあとの裏での処理。詳細は [architecture.md](./architecture.md#写真の一括読み取り旧レシート) |
| 燃費のシェアカード（ホーム・`/stats`） | 2026-10-14 | 「今月の燃費をシェア」で今月（満タン給油が無ければ直近 30 日）の燃費・給油回数・走行距離・給油代を 1200×630 の画像にし、端末の共有シート（Web Share API）・X の投稿画面・画像の保存で共有する。画像はブラウザの canvas で作り、サーバーには送らない。リンクは `?utm_source=share&utm_medium=card` 付き（解析の `beforeSend` は utm_* を残すので、utm と参照元で見る）。詳細は [architecture.md](./architecture.md#シェアカード今月の燃費をシェア) |
| Clerk 本番インスタンスへの移行 | 2026-10-13 | 本番を Clerk の本番インスタンス + Supabase Third-Party Auth に切り替え（Preview / ローカルは開発インスタンス + JWT テンプレートのまま）。詳細は [auth-production.md](./auth-production.md) |
| Web Share Target（Android の共有メニューから写真をスキャンへ） | 2026-10-08 | `public/sw.js` が POST /share を端末内で受け取り IndexedDB 経由で `/app?action=shared` に渡す。サーバーには送らない |
| データアダプタ層（`lib/data/`） | 2026-10-08 | 記録・車両の保存先を `RecordStore` / `VehicleStore` に切り出し、localStorage 版とクラウド版が同じインターフェースを満たす。障害・閲覧専用・キャッシュは `withOutageHandling` / `withCache` が受け持ち、フックは状態・楽観更新・連鎖計算・イベントだけを扱う。詳細は [architecture.md 2 章](./architecture.md#データアダプタ層libdata) |
| オドメーター → トリップ切替時の区間距離の書き戻し | 2026-10-08 | 車両の方式をオドメーターからトリップに切り替えるとき、連鎖計算で導出した区間距離を記録の `total_distance` に書き戻す（`planDistanceWriteBack`）。詳細は [design-fill-chain.md 4 章](./design-fill-chain.md#車両管理モーダル) |
| スマホ幅（375〜430px）のレイアウト整理 | 2026-10-09 | 狭い画面での各画面のレイアウトを整理した |
| レシートとメーターを別々に撮る（2 枚で読み取る） | 2026-10-15 | 1 枚に収まらないときに、スキャンメニューの「レシートとメーターを別々に撮る」からレシート → メーターの順に撮影・選択し（撮り直し・入れ替え・「メーターなしで読み取る」付き）、2 枚を 1 回の `/api/analyze`（`images: [{ role: "receipt" }, { role: "meter" }]`。1 枚の形はそのまま）で読み取る。1 枚 0.6MB 以下に圧縮し、サーバーは 1 枚 1.5MB・合計 Base64 3.5MiB まで。プロンプトで 1 枚目 = レシート / 2 枚目 = メーターと項目ごとの読み取り元を固定し、メーターが無い・入れ替わっているときは null と低い確信度を返させる。PC で 2 枚をドロップしてもこのシートを開く。詳細は [api-analyze.md](./api-analyze.md#リクエスト)・[architecture.md 2 章](./architecture.md#2-データフロー) |
| D デザインへの刷新（スマホ・PC） | 2026-10-11 | 計器盤のようなダーク UI とグループリストに全画面を作り直した。スマホは下部タブバー（中央にスキャンボタン）、PC は左サイドバー。スキャンボタンは「撮影する / アルバムから選ぶ / 手動で入力」のメニュー（`/app?action=album` を追加）。ホームは燃費メーターのヒーロー・今月・最近の記録（履歴の該当記録へ `/history#record-<id>` で直接開く）、履歴は月ごとの見出し付きの一覧で行を開いて詳細・編集、統計は平均燃費のヒーローと費用の一覧。詳細は [design-system.md](./design-system.md) |

## 今後の候補

### 統計と通知

| 候補 | 利用者にとっての価値 | 規模 | 主な変更ファイル |
|---|---|---|---|
| 車両比較と月次コストの積み上げ | 複数車両の燃費・支出を並べて比較し、月次コストを車両別に積み上げて表示する | M | `app/(app)/stats/page.tsx`、`lib/stats/`（`buildStatsModel`）、`lib/useFuelRecords.ts`（全車両の取得は `fetchAllRecords` を利用できる） |
| 月次予算 | 月ごとの燃料費の予算に対する進み具合が分かる | S | `lib/stats/`（`buildMonthlyCostSeries` を利用）、`app/(app)/stats/page.tsx`、予算の保存先 |
| 整備リマインダー | オイル交換などの時期を距離・日付で知らせる | M | 新規テーブルとマイグレーション（RLS ポリシーを追加したら [supabase/README.md](../supabase/README.md#2-rls-が有効か確認する) の監査対象一覧も更新）、新規画面 |

### 基盤・運用

| 候補 | 利用者にとっての価値 | 規模 | 主な変更ファイル |
|---|---|---|---|
| オフラインキュー | 電波の悪い場所でも撮影・手動入力を溜めておき、復帰後に解析・同期できる | M | `public/sw.js`（現状は共有の受け取りのみ、キャッシュなし）、`lib/scan/useScanPipeline.ts`、`lib/data/`（書き込みのキュー） |
| Supabase Realtime | 他の端末やタブでの変更が、画面を開いたままでも即座に反映される（画面に戻ったときの再取得は実装済み） | M | `lib/useFuelRecords.ts`、`lib/useVehicles.ts` |
| Clerk ネイティブ Third-Party Auth への移行 | Supabase の JWT Secret を Clerk に共有しなくてよくなる（[architecture.md 7 章](./architecture.md#7-認証)） | S | `lib/supabaseClient.ts`（`getToken()` に変更）、Clerk / Supabase のダッシュボード |
| E2E テストの追加 | 画面をまたぐ回帰を防ぐ。Playwright で `/api/analyze` をモックし、スキャン → 確認 → 保存 → 履歴の流れを検証する（コンポーネントテストは `tests/components/` にあり、未対応の画面は追加で拡充） | M | `package.json`、新規 `e2e/`、`.github/workflows/ci.yml` |

## 既知の制約

- `/api/analyze` のレートリミット（1 分 5 回）と、未ログインのお試しの IP ごとの 1 日の上限（10 回）は、サーバーインスタンスのメモリ上のカウンタです。
  サーバーレス環境ではインスタンスごとに別々で、コールドスタートで消えます。厳密な制限には外部ストア（Upstash Redis など）が必要です。
- お試しの回数（3 回）は Cookie で数えるので、Cookie を消す・別のブラウザを使うと数え直せます。歯止めは IP ごとの上限だけです。
  逆に、同じ IP を多くの人が共有する環境（携帯回線の CGNAT・社内ネットワークなど）では、1 日 10 回の上限を他の人と分け合います。
  同じ Cookie で同時に送ったリクエストは、どちらも同じ回数から数えるため、並行して送ると 3 回を少し超えられます（IP の上限で抑える）。
- 公開ページ（`/`・`/calc`・`/gas-cost`）の「登録なしで3回まで試せます」は静的に描画するため、`TRIAL_COOKIE_SECRET` の有無はビルド時の値で決まります。設定を変えたら再デプロイします。
- GitHub Actions の keepalive は anon キーを使います。anon が実行できるのは `keepalive_ping()` だけで
  （3 テーブルの権限は revoke 済み）、10 分のスロットルがあります。
- `SUPABASE_SERVICE_ROLE_KEY` を設定していない場合、`/api/keepalive` の件数（`counts`）は `null` になります（想定どおり）。
- AI はオドメーターも読み取ります。オドメーターモードの車両では確認シートのオドメーター欄に入れて保存しますが、トリップモードの車両では参考表示するだけで保存しません。
- レシートとメーターを別々に撮ったとき（2 枚）の役割は利用者の選択どおりに送ります。画像の取り違え（入れ替わり・メーターが写っていない）はサーバーでは判定せず、
  プロンプトで null と低い確信度を返させて確認シートの「要確認」に出すだけです（モデルが確実に気づく保証はありません。実際の Gemini での 2 枚の読み取り精度は未検証）。
  2 枚のドロップは PC のみで、ペーストは 1 枚だけ・共有（Web Share Target）は従来どおり 1 枚です。
- 単価は 0.1 円単位に丸めて保存します（`lib/calculations.ts`）。
- スタンド別の平均単価の集計（`lib/stats/prices.ts` の `summarizeStations`、画面からは外し済み）は、店舗名の表記ゆれ（全角・半角、会社名、ブランドの別名、「セルフ」、末尾の「店」など）だけを吸収します。略称や別の地名で記録された同じスタンドはまとめられず、ブランドの判定も `lib/stations.ts` の小さな辞書に載っているものだけです。画面に戻す場合もこの制約が残ります。
- 燃費は連鎖計算（[architecture.md 10 章](./architecture.md#10-給油の連鎖計算fill-chain)）で読み取り時に導出します。部分給油の記録は燃費が null で、次の満タン給油にまとめて計算されます。
  オドメーターモードでは、先頭の記録、前回の記録にオドメーターが無い記録、`missed_previous` の記録は区間距離が分からず燃費も null になります（トリップ → オドメーターに切り替えても既存の記録は書き換えないので、切り替え直後は `odometer` の無い記録が該当します）。
  逆にオドメーター → トリップに切り替えるときは、導出した区間距離を `total_distance` に書き戻します（[design-fill-chain.md 4 章](./design-fill-chain.md#車両管理モーダル)）。書き戻した値は保存時点のもので、後から前後に記録を足しても更新されません。区間が出ない記録の保存値は残します。
- 画面の配色はダーク固定で、ライトテーマや OS の設定への追従はありません。recharts の色は `app/(app)/stats/_components/chartTheme.ts` にトークンと同じ値を複製しているため、トークンを変えたときは手で合わせます（[design-system.md](./design-system.md#recharts-の色)）。
- 履歴・統計・履歴画面の CSV 出力は選択中の車両単位です（全車両の CSV 出力は設定画面にあります。全車両を横断した集計はありません）。
- 取り込みは FuelLens の JSON バックアップの復元と、Fuelio / FuelLens の CSV のインポートです（どちらも追記専用）。Fuelio の給油以外の記録（`## Costs` など）、マイル・ガロン単位の CSV、その他のアプリの CSV には対応していません。
- Service Worker は Web Share Target の受け取り専用でキャッシュを持たず、オフラインでは動作しません。Web Share Target は Android Chrome のみ（iOS は非対応）。
- 未ログイン時のデータはそのブラウザの localStorage にだけあり、端末間で共有されません。
- 他のタブや端末での変更は、ログイン中に 10 秒以上離れていた画面へ戻ったとき（30 秒に 1 回まで）に反映されます。画面を開いたまま見ている間は反映されません（Realtime は未対応）。未ログインのデータは端末内だけです。
- 障害（一時停止・接続不可）は、ログイン中に Supabase へアクセスしたときにだけ検知されます。
- Clerk のトークン取得失敗が確定するまで、postgrest-js の再試行により最長 7 秒ほどかかります。
- Vercel Hobby の Cron は 1 日 1 回、実行時刻に ±59 分のずれがあり、本番デプロイでしか動きません。
- テストは Vitest の 2 プロジェクトです。`lib/` の関数の単体テストは `environment: "node"`（`tests/**/*.test.ts`）、
  主要なコンポーネントのテストは jsdom + Testing Library（`tests/components/**/*.test.tsx`）で、全画面は網羅していません。E2E テストはありません。
