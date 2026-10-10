# FuelLens ドキュメント

| ドキュメント | 内容 |
|---|---|
| [architecture.md](./architecture.md) | ディレクトリ構成、データフロー、データモデル、フック、ローカル→クラウド移行、障害時の動作、認証、バックアップと復元、PWA、給油の連鎖計算 |
| [design-fill-chain.md](./design-fill-chain.md) | 設計: オドメーターモード・部分給油・記録漏れ・燃料種別・メモ。追加する列、連鎖計算（fill chain）の規則、UI と周辺機能の仕様 |
| [api-analyze.md](./api-analyze.md) | AI 解析 API `/api/analyze` の仕様（認証、制限、検証、レスポンスコード） |
| [operations.md](./operations.md) | デプロイ構成、Supabase 自動停止対策、CI、セットアップチェックリスト、トラブルシューティング |
| [design-system.md](./design-system.md) | UI のデザインシステム: トークン（色・角丸）、文字、`components/ui` の部品、ナビゲーション（タブバー / サイドバー）、ルール |
| [roadmap.md](./roadmap.md) | 今後の候補と既知の制約 |
| [tech_stack.md](./tech_stack.md) | 技術スタックと選定理由 |
| [../supabase/README.md](../supabase/README.md) | DB の runbook（マイグレーション適用、RLS とポリシーの監査、バックアップ） |
