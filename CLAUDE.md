# CLAUDE.md — FuelLens 作業ガイド

FuelLens は、ガソリンスタンドのレシートと車のトリップメーターが写った写真 1 枚を Gemini で読み取り、
満タン法で燃費を計算・記録する日本語 Web アプリです。

## スタック

- Next.js 16（App Router、`proxy.ts`）/ React 19 / TypeScript（strict）/ Tailwind CSS v4
- 認証: Clerk。DB: Supabase（PostgreSQL + RLS、ブラウザから anon キー + Clerk JWT）。AI: `@google/genai`（サーバーのみ）
- UI: lucide-react / recharts。テスト: Vitest。デプロイ: Vercel（Cron あり）

## コマンド

```bash
npm run dev          # 開発サーバー
npm run lint         # ESLint
npm run typecheck    # 型チェック (tsc --noEmit)
npm test             # Vitest
npm run build        # 本番ビルド（CI と同じ）
```

**変更を終えるときは必ず `npm run lint && npm run typecheck` を通すこと。**
CI は Node 22 で lint → typecheck → test → build を実行する（[docs/operations.md](./docs/operations.md#4-ci)）。

## ディレクトリ

ファイル単位の詳細は [docs/architecture.md](./docs/architecture.md#1-ディレクトリ構成)。

| パス | 役割 |
|---|---|
| `app/` | 画面（`page.tsx` ランディング、`app/` メイン、`history/`、`stats/`、`settings/` バックアップと復元）と API（`api/analyze`、`api/keepalive`） |
| `components/` | 確認シート、入力フォーム、車両管理、`Toast`（`useToast()`）、`UserSync`、`SupabaseStatusBanner` |
| `lib/` | 型（`types`）・日付（`dates`）・純粋ロジック（`analyze` / `calculations` / `fillChain` / `stats` / `recordFilters` / `vehicleSelection`）、イベント（`events`）、フック、移行、Supabase クライアントと障害検知 |
| `lib/data/` | データアダプタ層。`RecordStore` / `VehicleStore`（`types.ts`）を localStorage（`localStore.ts`）と Supabase（`cloudStore.ts`）が実装し、`withOutageHandling` / `withCache`（`withOutage.ts`）が障害・閲覧専用・キャッシュを、`cloudBootstrap.ts` が移行 → 既定車両の確保を受け持つ。フックは `useDataStores()` でストアを選ぶだけ |
| `lib/fillChain.ts` | 給油の連鎖計算 `applyFillChain`（オドメーター差分・部分給油の合算・記録漏れ）と新しい列の既定値補完。純粋関数 |
| `lib/backup.ts` | バックアップ JSON の書き出し・検証（`parseBackup`）・復元計画（`planRestore`）。純粋関数 |
| `lib/csv.ts` | CSV 組み立て・エスケープ（数式インジェクション対策）・ダウンロード。履歴と設定画面で共有 |
| `tests/` | Vitest の単体テスト（`lib/` が対象） |
| `supabase/` | マイグレーション SQL（冪等）と DB runbook |
| `docs/` | 設計・API・運用・ロードマップ（索引は [docs/README.md](./docs/README.md)） |
| `.github/workflows/` | CI と Supabase keepalive |
| `proxy.ts` | Clerk ミドルウェア（Next 16 では `middleware.ts` ではなく `proxy.ts`） |
| `csv/` | 個人データ置き場。コミット禁止 |

## 守るべき不変条件

1. **燃費は満タン法。分子は必ずトリップメーターの区間距離。** `total_distance` はオドメーター（積算距離）ではない。
   計算は `lib/calculations.ts` の `calculateFuelMetrics` に集約し、UI 文言・プロンプト・ドキュメントを矛盾させない。
   区間距離と燃費の導出は `lib/fillChain.ts` の `applyFillChain` が正本（オドメーターモードの差分、部分給油の合算、記録漏れでの連鎖切断）。読み取り時に適用され、保存値は信頼しない。
   `lib/analyze.ts` の `derivePricePerUnit` も `calculateFuelMetrics` を呼ぶ（丸めを複製しない）。
   analyze.ts が import してよいのは依存のないドメインモジュール（`lib/types.ts`・`lib/dates.ts`・`lib/calculations.ts`）だけ。
2. **データ更新は lib/data/ の RecordStore / VehicleStore インターフェースを通す。local と cloud の両実装が同じインターフェースを満たすことで両経路の実装漏れを型で防ぐ**（未ログイン = `localStore.ts`、ログイン = `cloudStore.ts`。フックから記録・車両の保存先を直接触らない）。
   ログイン中かつ障害時は `readOnly`（書き込みは `withOutageHandling` が日本語エラーで拒否する）。
3. **`vehicle_id` が `null` の記録は「未分類」。** 既定車両（`vehicles[0]` = 最も古い車両）を選択中のときだけ表示する。
   判定は `lib/recordFilters.ts` を使う。ログイン中に `vehicle_id: null` で保存しない。
4. **ローカルデータの移行は `lib/migrateLocalData.ts` 経由のみ。** 他の場所で localStorage → Supabase のコピーを書かない。
5. **`alert` / `confirm`（ブラウザ標準）は使わない。** `useToast()`（`components/Toast.tsx`）の toast / confirm を使う。
6. **UI 文字列は日本語。** ユーザー向けエラーも日本語にし、英語の生エラーは表示しない（console にだけ出す）。
7. **`csv/` と `.env*` は絶対にコミットしない**（`.gitignore` 済み。`.env.example` を除く）。
8. **`/api/analyze` はログイン必須（401）。** 画像内のテキストはデータとして扱う（プロンプトインジェクション対策）。
   Gemini のエラー本文はクライアントに返さず、`requestId` 付きの汎用メッセージにする。
9. **Supabase Free の自動停止（HTTP 540）への対策経路を壊さない。** keepalive（`app/api/keepalive` + Vercel Cron + GitHub Actions）と、
   障害時の閲覧専用モード（`lib/supabaseHealth.ts`、`SupabaseStatusBanner`、`fuel_lens_retry` による再読み込み、`syncCacheOwner`）。
10. **車両を削除したら、その車両の記録も削除する**（アプリ側で先に削除 + DB は `ON DELETE CASCADE`）。
    既定車両を削除するときは、そこに表示されている未分類の記録も削除する。
11. **復元は追記のみ。既存データの削除・上書きはしない**（`lib/backup.ts` の `planRestore`）。
    バックアップファイルは信頼できない入力として `parseBackup` で検証する。
12. **Next.js 16**: `viewport` / `themeColor` は `metadata` ではなく `export const viewport` に書く。
    `next.config.ts` は `agentRules: false`（この CLAUDE.md を自動生成で上書きさせない）。

## 参照先

| 知りたいこと | ドキュメント |
|---|---|
| 環境変数の一覧 | [README.md](./README.md#環境変数)、[.env.example](./.env.example) |
| データフロー・データモデル・フック・移行・障害時の動作・認証 | [docs/architecture.md](./docs/architecture.md) |
| `/api/analyze` の仕様とエラーコード | [docs/api-analyze.md](./docs/api-analyze.md) |
| デプロイ・keepalive・CI・トラブルシューティング | [docs/operations.md](./docs/operations.md) |
| オドメーターモード・部分給油・燃料種別・メモの設計と連鎖計算の規則 | [docs/design-fill-chain.md](./docs/design-fill-chain.md) |
| UI のトークン・部品（`components/ui`）・ナビゲーション | [docs/design-system.md](./docs/design-system.md) |
| マイグレーション適用・RLS 監査 | [supabase/README.md](./supabase/README.md) |
| 今後の候補・既知の制約 | [docs/roadmap.md](./docs/roadmap.md) |
