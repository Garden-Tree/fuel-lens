import { auth, clerkClient } from "@clerk/nextjs/server";
import {
  ACCOUNT_MAX_REQUESTS_PER_WINDOW,
  ACCOUNT_RATE_LIMIT_WINDOW_MS,
  handleDeleteAccount,
} from "@/lib/server/account/handler";
import { MAX_RATE_LIMIT_KEYS, createRateLimiter } from "@/lib/server/analyze/rateLimit";

// モジュールレベル（= サーバーレスのインスタンスごと。ベストエフォート）。キー = ログインユーザー ID
const limiter = createRateLimiter({
  windowMs: ACCOUNT_RATE_LIMIT_WINDOW_MS,
  max: ACCOUNT_MAX_REQUESTS_PER_WINDOW,
  maxKeys: MAX_RATE_LIMIT_KEYS,
});

/** アカウント削除（Clerk のユーザー）。仕様は docs/api-account.md、本体は lib/server/account/handler.ts */
export async function DELETE(req: Request) {
  return handleDeleteAccount(req, {
    auth: async () => {
      const { userId } = await auth();
      return { userId };
    },
    deleteUser: async userId => {
      const client = await clerkClient();
      return client.users.deleteUser(userId);
    },
    limiter,
    env: { NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL },
    log: (level, ...args) => console[level](...args),
  });
}
