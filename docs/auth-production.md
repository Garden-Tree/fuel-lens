# 認証の方針と Clerk 本番インスタンスへの切り替え

2026-10-12 時点の調査。確認元はリポジトリと各サービスの公式ドキュメント（末尾）。

## 1. 現状

- 認証は Clerk の **開発インスタンス**（`pk_test`）を本番でも使っている。
- Supabase へは Clerk の JWT テンプレート `supabase`（HS256、Supabase の JWT Secret で署名）を `lib/supabaseClient.ts` の `getToken({ template })` で渡している（テンプレート名は環境変数 `NEXT_PUBLIC_CLERK_SUPABASE_JWT_TEMPLATE`）。
- RLS は `(select auth.jwt()->>'sub') = user_id`。`users.id` / `vehicles.user_id` / `fuel_records.user_id` は text の Clerk ID。
  `vehicles` / `fuel_records` の `user_id` は `users.id` への FK（`ON DELETE CASCADE`、`ON UPDATE CASCADE` はなし）。
- ログイン方法は Google OAuth とメール（コード入力）。

### 開発インスタンスのまま使い続ける問題

- ユーザー数の上限（公式ドキュメントでは 100 人。ダッシュボードで要確認）。
- バックエンド API のレート制限が本番の 1/10（100 リクエスト / 10 秒）。
- ログイン画面・Google の同意画面が Clerk 名義・`accounts.dev` ドメインになる。メールにテスト用の表記が付く。
- ボット対策などの一部機能が本番のみ。
- 開発インスタンスのユーザーは本番インスタンスへ移せない（後述の ID 付け替えが必要）。

## 2. 自前化するか（比較）

| 案 | 月額（0〜10k MAU） | このコードベースでの移行工数 | 主なリスク |
|---|---|---|---|
| Clerk を続ける（本番インスタンス） | 無料（Hobby は 50,000 MRU まで） | 小。コードは `getToken()` の変更程度 | Clerk への依存。無料枠では MFA・パスキー・メールテンプレート編集なし、ソーシャル接続は 3 つまで |
| Supabase Auth | 無料（Free は 50,000 MAU） | 大。ログイン UI の作り直し、`proxy.ts` / `UserSync` / `supabaseClient` / `/api/analyze` の認証確認、全データの `user_id` 付け替え | メール OTP には独自 SMTP（Resend など）が実質必須。既定の SMTP は 2 通 / 時間 |
| Auth.js v5 / Better Auth を自前 DB で | 無料 + 運用の手間 | 大〜特大 | OTP メール配信、レート制限、セッション、CSRF、アカウント乗っ取り対策、Supabase 用 JWT の署名鍵の保管がすべて自前 |
| 完全自作 | 無料 | 特大 | セキュリティの責任がすべて自分。非推奨 |

**結論: Clerk を続け、本番インスタンスに切り替える。** 利用者数が少ない今は無料枠に大きく余裕があり、自前化は工数と事故のリスクに見合わない。
将来移る可能性に備えるには、`user_id` を text のまま保ち、RLS を `sub` 照合のままにしておけば十分（移行時は ID の付け替え SQL だけで済む）。

iOS のホーム画面アプリでは、OAuth のリダイレクトで Safari に飛ばされるなどの既知の問題がある（一般的な知見。どの方式でも実機確認が必要）。
画面遷移のないメールのコード入力はこの問題を避けやすい。

## 3. Supabase 連携は「ネイティブ Third-Party Auth」に切り替える

- JWT テンプレート方式は 2025-04-01 から非推奨。Supabase の JWT Secret を Clerk に渡す必要があり、鍵のローテーションで止まりやすい。
- 現行の推奨は Supabase の **Third-Party Auth（Clerk）**。Clerk のセッショントークンに `role: "authenticated"` が付き、Supabase が Clerk の公開鍵で検証する。
- Supabase 側の Third-Party MAU は Free で 50,000 まで。
- 本番インスタンスを作るタイミングで同時に切り替えるのが最も手戻りが少ない。

手順:

1. Clerk ダッシュボードの Supabase 連携ページで、本番インスタンスの連携を有効にし、表示される Clerk のドメインを控える。
2. Supabase の Authentication → Sign In / Providers → Third-Party Auth で Clerk を追加し、そのドメインを貼る。
3. コードは公開環境変数 `NEXT_PUBLIC_CLERK_SUPABASE_JWT_TEMPLATE` で切り替える（実装済み）。
   - 値あり（`supabase`）: `getToken({ template })`。JWT テンプレートを使う開発インスタンス（ローカル・Vercel Preview）用。
   - 空 / 未設定: `getToken()`。ネイティブ Third-Party Auth の本番インスタンス用。Vercel **Production では設定しない**。
   RLS（`sub` 照合）はそのまま使える。
4. 切り替え後は JWT テンプレートと JWT Secret の共有が不要になる。

注意: 環境変数を空にした環境では、連携を設定していない Clerk インスタンスから Supabase へのアクセスが失敗する。
開発インスタンスを使うローカルと Preview では `NEXT_PUBLIC_CLERK_SUPABASE_JWT_TEMPLATE=supabase` を必ず設定する。

## 4. 本番インスタンスへの切り替え手順

公式の production deployment ガイドに沿う。

1. **本番インスタンスを作る**（Clerk ダッシュボード）。開発設定のクローンも選べるが、SSO 接続・Integrations・Paths はコピーされないので設定し直す。
2. **DNS を設定する**。Domains ページに必要なレコードが表示される（Frontend API 用の CNAME（例: `clerk.fuel-lens.gadelog.com`）とメール送信用の CNAME 群）。
   - 反映に最大 48 時間。
   - Cloudflare の場合は「DNS only」（プロキシ無効）。
   - 親ドメインの CAA レコードが Let's Encrypt / Google Trust Services を拒否していると証明書が発行されない。
   - `gadelog.com` の DNS をどこで管理しているかはリポジトリに記載がないので、レジストラ / DNS サービスを確認する。
3. **Google OAuth を自前の資格情報にする**（本番では必須）。
   - Clerk: SSO connections → Google → 「Use custom credentials」を有効にし、Authorized Redirect URI をコピー。
   - Google Cloud Console: OAuth クライアント ID（ウェブアプリ）を作成し、承認済み JavaScript 生成元に本番ドメイン、リダイレクト URI に Clerk の URI を入れる。
   - Client ID / Secret を Clerk に貼る。
   - OAuth 同意画面の公開ステータスを「テスト」から「本番」にする（テストのままだとテストユーザー 100 人まで）。
4. **メール**は Clerk が送信する（DNS の CNAME で送信ドメインを認証）。テンプレートの編集は有料機能。
5. **Supabase 連携**を 3 章の手順でネイティブ方式にする。
6. **Vercel の環境変数**を Production だけ差し替えて再デプロイする。
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` = `pk_live_...`、`CLERK_SECRET_KEY` = `sk_live_...`。
   - Preview とローカルは開発キーのままにできる。
7. ダッシュボードのホームに残りのステップがなくなったら **Deploy certificates** を押す。
8. `clerkMiddleware()` の `authorizedParties` は `proxy.ts` で設定済み（`https://fuel-lens.gadelog.com`、`NEXT_PUBLIC_APP_URL`、`VERCEL_URL` / `VERCEL_BRANCH_URL`、開発時の localhost:3000）。`azp` を完全一致で照合するため、別ドメインを追加するときは `proxy.ts` に足す。

### 切り替え前のテスト

- 先に Preview（`develop`）だけ本番キーにして、Google ログイン、メールのコード入力、iOS のホーム画面アプリ、RLS、`/api/analyze` の 401 を確認する。
- ロールバックは Vercel の環境変数を戻して再デプロイするだけ。開発インスタンスとそのユーザーは、移行が落ち着くまで消さない。

## 5. ユーザー ID の付け替え

同じ Google アカウントでも、本番インスタンスでは別の `user_...` ID になる。
本番でオーナーが一度ログインして `users` 行を作らせ、新しい ID を確認してから、SQL Editor（postgres ロール。RLS は迂回される）で 1 ユーザーずつ付け替える。

実行前に、設定画面のバックアップ（JSON）か `pg_dump` でバックアップを取る。

```sql
begin;
-- 対応を必ず目視確認する: select id, email from public.users;
insert into public.users (id, email, updated_at)
  select 'user_NEW', email, now() from public.users where id = 'user_OLD'
  on conflict (id) do nothing;
update public.vehicles     set user_id = 'user_NEW' where user_id = 'user_OLD';
update public.fuel_records set user_id = 'user_NEW' where user_id = 'user_OLD';
-- 子を付け替えてから旧行を消す（先に消すと ON DELETE CASCADE で記録が消える）
delete from public.users where id = 'user_OLD';
-- 確認: 旧 ID の vehicles / fuel_records が 0 件、新 ID に移っている
-- select user_id, count(*) from public.fuel_records group by 1;
commit;  -- 想定と違えば rollback;
```

`vehicle_id` は変わらないので、記録と車両のつながりは壊れない。元に戻すときは old / new を入れ替えて同じ SQL を流す。

## 6. 進め方のチェックリスト

| # | 作業 | 担当 |
|---|---|---|
| 1 | `gadelog.com` の DNS の管理場所を確認 | オーナー |
| 2 | Clerk で本番インスタンスを作成し、DNS に CNAME を追加（CAA も確認） | オーナー |
| 3 | Google Cloud で OAuth クライアントを作成し、同意画面を「本番」に | オーナー |
| 4 | Clerk の Supabase 連携を有効化し、Supabase に Third-Party Auth（Clerk）を追加 | オーナー |
| 5 | `NEXT_PUBLIC_CLERK_SUPABASE_JWT_TEMPLATE` による切り替えと `proxy.ts` の `authorizedParties`、ドキュメント更新（実装済み） | コード |
| 6 | Preview で全項目を確認 | オーナー + コード |
| 7 | Vercel Production のキーを `pk_live` / `sk_live` に差し替え、`NEXT_PUBLIC_CLERK_SUPABASE_JWT_TEMPLATE` を削除（空）して再デプロイ。Preview / ローカルは `supabase` のまま | オーナー |
| 8 | 本番でログインし、新 ID を確認して付け替え SQL を実行 | オーナー |
| 9 | 動作確認後、JWT テンプレートを削除 | オーナー |

## 出典

- Clerk 本番デプロイ: https://clerk.com/docs/guides/development/deployment/production
- Clerk Supabase 連携: https://clerk.com/docs/guides/development/integrations/databases/supabase
- Clerk Google 資格情報: https://clerk.com/docs/guides/configure/auth-strategies/social-connections/google
- Clerk 料金: https://clerk.com/pricing
- Clerk システム制限: https://clerk.com/docs/guides/how-clerk-works/system-limits
- Clerk 環境の違い: https://clerk.com/docs/guides/development/managing-environments
- Supabase Third-Party Auth（Clerk）: https://supabase.com/docs/guides/auth/third-party/clerk
- Supabase 本番チェックリスト: https://supabase.com/docs/guides/platform/going-into-prod
- Supabase 料金: https://supabase.com/pricing
