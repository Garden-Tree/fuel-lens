import { jaJP } from "@clerk/localizations/ja-JP";

/**
 * Clerk の UI（ログイン / サインアップ / アカウント管理）を日本語にする設定。
 * 公式の jaJP に、メールの確認コードの案内（迷惑メールフォルダの確認）だけを上書きする。
 * `{{applicationName}}` / `{{identifier}}` は Clerk が埋め込むプレースホルダーなので、そのまま残すこと。
 */

const SPAM_HINT = "届かないときは迷惑メールフォルダも確認してください。";

type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** base を壊さずに、overrides の値で再帰的に上書きした新しいオブジェクトを返す */
export function deepMerge<T extends PlainObject>(base: T, overrides: PlainObject): T {
  const result: PlainObject = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    const current = result[key];
    result[key] = isPlainObject(current) && isPlainObject(value) ? deepMerge(current, value) : value;
  }
  return result as T;
}

/** jaJP に重ねる上書き（キーは Clerk の en-US と同じ構造） */
export const CLERK_LOCALIZATION_OVERRIDES = {
  signIn: {
    emailCode: {
      subtitle: `メールに届いた確認コードを入力してください。${SPAM_HINT}`,
    },
    emailCodeMfa: {
      subtitle: `メールに届いた確認コードを入力してください。${SPAM_HINT}`,
    },
  },
  signUp: {
    emailCode: {
      subtitle: `メールに届いた確認コードを入力してください。${SPAM_HINT}`,
      formSubtitle: `メールに届いた確認コードを入力してください。${SPAM_HINT}`,
    },
  },
  userProfile: {
    emailAddressPage: {
      emailCode: {
        formSubtitle: `{{identifier}} に届いた確認コードを入力してください。${SPAM_HINT}`,
      },
    },
  },
} as const;

export const clerkLocalization = deepMerge(jaJP, CLERK_LOCALIZATION_OVERRIDES);
