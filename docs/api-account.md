# アカウント削除 API（`DELETE /api/account`）

ログイン中の利用者の **Clerk のユーザー** を削除する API です。設定画面の「アカウント」から呼ばれます。
DB のデータ（記録・車両・`users` 行）はこの API の前に、ブラウザが利用者自身の Clerk JWT（RLS）で削除します
（`lib/data/accountDeletion.ts` の `deleteOwnData`）。サーバーには service_role キーを置かないため、DB には触れません。
全体の流れは [architecture.md「アカウント削除」](./architecture.md#アカウント削除) を参照してください。

実装は `app/api/account/route.ts`（実際の依存 = Clerk の `auth()` と `clerkClient().users.deleteUser`、モジュールレベルのレートリミッタを渡すだけの薄い `DELETE`）と、
本体の `lib/server/account/handler.ts`（`handleDeleteAccount(req, deps)`。依存を注入でき、`tests/accountHandler.test.ts` で検証）です。

## リクエスト

```http
DELETE /api/account
```

本文はありません。認証は Clerk のセッション Cookie です（`proxy.ts` の `clerkMiddleware` が `/api` を通す）。

## 処理の順序

1. **Origin チェック**: `Origin` のホストが `Host` / `X-Forwarded-Host` / `NEXT_PUBLIC_APP_URL` のホストのいずれとも一致しなければ 403
   （`Origin` が無いリクエストは通す。判定は `/api/analyze` と同じ `isAllowedOrigin`）。
2. **認証**: `auth()` でログインを確認し、未ログインは 401。
3. **レートリミット**: ログインユーザー ID ごとに **1 分間 3 回** まで（`createRateLimiter` を流用。インスタンスのメモリ上のベストエフォート）。
4. **Clerk のユーザーの削除**: `deleteUser(userId)`。Clerk が 404（既に削除済み）を返したときも成功として扱う（再試行・別タブで二重に呼ばれても 204）。

Clerk のエラー本文はクライアントに返さず、`[account <requestId>]` 接頭辞付きでサーバーのログにだけ出します。

## レスポンス

| ステータス | 本文 | 意味 |
|---|---|---|
| 204 | なし | 削除した（または既に無かった） |
| 401 | `{ error, code: "UNAUTHENTICATED", requestId }` | 未ログイン |
| 403 | `{ error, code: "ORIGIN_MISMATCH", requestId }` | 別オリジンからのリクエスト |
| 429 | `{ error, code: "RATE_LIMITED", requestId }`、`Retry-After` ヘッダー | 1 分間の上限を超えた |
| 500 | `{ error: "アカウントを削除できませんでした。…", code: "DELETE_FAILED", requestId }` | Clerk の削除に失敗した |

`error` は日本語の汎用メッセージです。クライアント（`components/AccountPanel.tsx`）は失敗時に `requestId` を「エラーID」として表示し、
DB のデータは削除済みでアカウントだけが残っていることを伝えます。もう一度「完全に削除する」を押すと、データの削除（冪等）とこの API をやり直します。

## 削除後

クライアントは `signOut({ redirectUrl: "/?deleted=1" })` でログアウトし、ランディングが一度だけ削除完了の通知を出します。
Clerk のダッシュボードから直接ユーザーを削除した場合は DB の行が残るため、[supabase/README.md 5 章](../supabase/README.md#5-ユーザーのデータを手作業で削除する) の SQL で削除してください。
