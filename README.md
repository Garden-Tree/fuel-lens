# FuelLens

FuelLens は、ガソリンスタンドのレシートと車のトリップメーターが写った写真を撮影（またはアップロード）するだけで、
AI（Google Gemini）が給油量・金額・走行距離などを読み取り、満タン法で燃費を計算・記録する Web アプリです。

## 特徴

- **AI 読み取り**: 写真 1 枚からレシートの給油情報とトリップメーターの区間距離を抽出します。
  保存前に確認シートで内容を確認・修正でき、読み取りに不安がある項目は「要確認」として強調されます。
- **燃費・単価の自動計算**: 満タン法で燃費（km/L）を、支払総額と給油量から単価（円/L）を算出します。
- **履歴と統計**: 履歴の一覧・編集・削除・CSV 出力、期間別の統計サマリーとグラフを表示します。
- **複数車両**: 車・バイクを複数登録し、車両ごとに記録を管理できます。
- **オドメーター入力方式と部分給油**: 車両ごとに、トリップメーターの区間距離を入力する方式と、オドメーター（積算距離）を入力して前回との差分から区間距離を出す方式を選べます。
  満タンにしなかった給油は「部分給油」として記録でき、次の満タン給油でまとめて燃費を計算します。給油の記録し忘れを示すと、そこで計算を区切ります。
- **燃料種別とメモ**: 給油ごとに燃料種別（レギュラー / ハイオク / 軽油 / その他）と 200 文字までのメモを残せます。車両ごとに既定の燃料種別も設定できます。
- **バックアップと復元**: 設定画面（`/settings`）で全車両・全記録を JSON でバックアップし、同じ JSON から復元できます。
  復元は追記のみで、既存のデータは削除・上書きしません。全車両の記録を 1 つの CSV に書き出すこともできます。
- **PWA（ホーム画面に追加）**: ホーム画面から起動でき、アイコンの長押しメニューから「スキャン」「手動で入力」を直接開けます。
  オフライン動作には未対応です。
- **共有から読み取り（Android）**: インストールした PWA は写真アプリの「共有」先に表示され、選んだ写真をそのままスキャンできます。
  画像はサーバーに保存せず端末内で受け渡します（Web Share Target。iOS Safari は未対応）。
- **未ログインでも使える**: 手動入力・履歴・統計はログインなしで使え、記録はブラウザの localStorage に保存されます。
  **写真からの AI 解析のみログインが必要**です。
- **クラウド同期**: Clerk でログインすると記録は Supabase に保存され、複数端末で共有できます。
  ログイン前のローカルの記録はログイン時に自動でクラウドへ移行されます。

## 燃費の計算について（満タン法）

- 燃費（km/L） = **前回の満タン給油からの走行距離 ÷ 給油量の合計**
- トリップメーターの車両（既定）で入力する「走行距離」は、**前回給油時にリセットしたトリップメーターの値（区間距離）** です。
  オドメーター（積算距離）の値を走行距離に入力しないでください。
- オドメーターの車両は、給油時のオドメーターを入力します。**前回の記録との差分**が区間距離になります
  （最初の記録や、前回の記録にオドメーターが無い場合は区間距離を出せません）。
- 部分給油（満タンにしなかった給油）は、その場では燃費を出さず、**次の満タン給油にまとめて**計算します
  （間の走行距離と給油量を合計して、合計距離 ÷ 合計給油量）。
- 記録し忘れた給油がある場合は「前回の給油を記録し忘れた」を付けると、そこで計算を区切ります。
- 正確な燃費を出すには、**満タン給油を基準**にしてください。トリップメーターの車両は給油のたびにリセットします。
  計算の詳細は [docs/design-fill-chain.md](./docs/design-fill-chain.md) を参照してください。

## クイックスタート

```bash
git clone https://github.com/Garden-Tree/fuel-lens.git
cd fuel-lens
npm install
cp .env.example .env.local   # 下表を参考に値を設定する
npm run dev                  # http://localhost:3000
```

ログイン後のクラウド保存を使うには、Supabase へのスキーマ適用と Clerk の JWT テンプレート設定が必要です
（[supabase/README.md](./supabase/README.md)）。
未ログインでの手動入力・履歴・統計は、Supabase と Gemini の設定がなくても動作します。

## 環境変数

| 変数名 | 必須 | 用途 |
|---|---|---|
| `GEMINI_API_KEY` | 必須 | Gemini API（AI 解析）のキー。サーバー専用 |
| `GEMINI_MODEL` | 任意 | 使用モデル。未設定時は `gemini-3.1-flash-lite` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | 必須 | Clerk（認証）の公開キー |
| `CLERK_SECRET_KEY` | 必須 | Clerk のシークレットキー |
| `NEXT_PUBLIC_SUPABASE_URL` | 必須 | Supabase プロジェクトの URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 必須 | Supabase の anon キー（RLS 前提） |
| `NEXT_PUBLIC_APP_URL` | 任意 | アプリの公開 URL。`/api/analyze` の Origin 許可ホストと `metadataBase` に使う |
| `NEXT_PUBLIC_ENABLE_SW` | 任意 | `1` で開発ビルドでも Service Worker（Web Share Target の受け取り）を登録する。本番ビルドでは常に登録 |
| `ALLOW_ANONYMOUS_SCAN` | 任意 | `true` で未ログインの AI 解析を IP ごとに 3 回まで許可（開発・デモ専用）。既定はログイン必須 |
| `CRON_SECRET` | 本番で必須 | Vercel Cron → `/api/keepalive` の認証用シークレット |
| `SUPABASE_SERVICE_ROLE_KEY` | 任意 | `/api/keepalive` で件数取得まで行う場合に設定。サーバー専用（`NEXT_PUBLIC_` を付けない） |

各変数の詳細は [.env.example](./.env.example)、`/api/analyze` 関連は [docs/api-analyze.md](./docs/api-analyze.md)、
keepalive 関連は [docs/operations.md](./docs/operations.md) を参照してください。

## 開発コマンド

```bash
npm run dev          # 開発サーバー (http://localhost:3000)
npm run lint         # ESLint (eslint-config-next)
npm run typecheck    # 型チェック (tsc --noEmit)
npm test             # 単体テスト (Vitest)
npm run build        # 本番ビルド
```

変更後は `npm run lint && npm run typecheck` を通してからコミットしてください。
CI（GitHub Actions）も同じ順序で lint → typecheck → test → build を実行します（[docs/operations.md](./docs/operations.md#4-ci)）。

## ドキュメント

| ドキュメント | 内容 |
|---|---|
| [docs/README.md](./docs/README.md) | ドキュメントの索引 |
| [docs/architecture.md](./docs/architecture.md) | ディレクトリ構成、データフロー、データモデル、フック、移行、障害時の動作、認証、バックアップと復元、PWA、給油の連鎖計算 |
| [docs/design-fill-chain.md](./docs/design-fill-chain.md) | 設計: オドメーターモード・部分給油・燃料種別・メモと連鎖計算 |
| [docs/api-analyze.md](./docs/api-analyze.md) | AI 解析 API `/api/analyze` の仕様 |
| [docs/operations.md](./docs/operations.md) | デプロイ、Supabase 自動停止対策、CI、セットアップ手順、トラブルシューティング |
| [docs/roadmap.md](./docs/roadmap.md) | 今後の候補と既知の制約 |
| [docs/tech_stack.md](./docs/tech_stack.md) | 技術スタックと選定理由 |
| [supabase/README.md](./supabase/README.md) | DB スキーマの適用・RLS 監査・バックアップの手順 |
| [CLAUDE.md](./CLAUDE.md) | AI エージェント向けの作業ルール |

## ライセンス

[MIT License](./LICENSE)
