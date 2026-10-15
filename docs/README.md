# FuelLens ドキュメント

| ドキュメント | 内容 |
|---|---|
| [setup.md](./setup.md) | 開発環境のセットアップ: クイックスタート、環境変数の一覧、開発コマンド |
| [architecture.md](./architecture.md) | ディレクトリ構成、データフロー、データモデル、フック、ローカル→クラウド移行、障害時の動作、認証、バックアップと復元、PWA、給油の連鎖計算 |
| [design-fill-chain.md](./design-fill-chain.md) | 設計: オドメーターモード・部分給油・記録漏れ・燃料種別・メモ。追加する列、連鎖計算（fill chain）の規則、UI と周辺機能の仕様 |
| [api-analyze.md](./api-analyze.md) | AI 解析 API `/api/analyze` の仕様（認証、制限、検証、レスポンスコード） |
| [api-account.md](./api-account.md) | アカウント削除 API `DELETE /api/account` の仕様（削除の流れ、認証、制限、レスポンスコード） |
| [operations.md](./operations.md) | デプロイ構成、Supabase 自動停止対策、CI、セットアップチェックリスト、トラブルシューティング |
| [play-store/README.md](./play-store/README.md) | Google Play での公開手順（TWA）: Play Console 登録、PWABuilder、署名鍵と Digital Asset Links、データ セーフティ、更新方法、プロモ動画の絵コンテ。掲載テキストは [play-store/listing.md](./play-store/listing.md) |
| [design-system.md](./design-system.md) | UI のデザインシステム: トークン（色・角丸）、文字、`components/ui` の部品、ナビゲーション（タブバー / サイドバー）、ルール |
| [auth-production.md](./auth-production.md) | 認証の方針（Clerk 継続 / 自前化の比較）と、Clerk 本番インスタンス・Supabase ネイティブ連携への切り替え手順、ユーザー ID の付け替え SQL |
| [roadmap.md](./roadmap.md) | 今後の候補と既知の制約 |
| [tech_stack.md](./tech_stack.md) | 技術スタックと選定理由 |
| [../supabase/README.md](../supabase/README.md) | DB の runbook（マイグレーション適用、RLS とポリシーの監査、バックアップ） |
