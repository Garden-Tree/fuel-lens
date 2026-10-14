"use client";

import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import { useAuth } from "@clerk/nextjs";
import { clientUatIndicatesSignedIn, resolveAuth, type InitialAuth, type ResolvedAuth } from "./initialAuth";

const InitialAuthContext = createContext<InitialAuth | null>(null);

/**
 * サーバー（app/(app)/layout.tsx の auth()）が知っているログイン状態をクライアントへ渡す。
 * value が null（不明）なら、各フックは従来どおり Clerk の読み込みを待つ。判定は lib/data/initialAuth.ts
 */
export function InitialAuthProvider({ value, children }: { value: InitialAuth | null; children: ReactNode }) {
  return <InitialAuthContext.Provider value={value}>{children}</InitialAuthContext.Provider>;
}

/** サーバーが知っているログイン状態（プロバイダの外・不明なら null） */
export function useInitialAuth(): InitialAuth | null {
  return useContext(InitialAuthContext);
}

const subscribeNothing = () => () => {};

/**
 * Clerk のクライアント Cookie（`__client_uat`）が「ログイン中かもしれない」を示すか。
 * SSR とハイドレーションの描画では null（読めない = サーバーの「未ログイン」を信用しない）。Cookie の変化は購読しない
 * （Clerk の読み込み後は Clerk の値を使うので、読み込み前の判定にだけ要る）
 */
export function useClientMaybeSignedIn(): boolean | null {
  return useSyncExternalStore(
    subscribeNothing,
    () => clientUatIndicatesSignedIn(document.cookie),
    () => null
  );
}

/**
 * Clerk の読み込み前はサーバーの初期認証状態で補ったログイン状態（resolveAuth）。
 * 画面の表示（未ログインの案内など）に使う。データの保存先は useDataStores が同じ判定で選ぶ。
 */
export function useResolvedAuth(): ResolvedAuth {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const initial = useInitialAuth();
  const clientMaybeSignedIn = useClientMaybeSignedIn();
  return resolveAuth({ isLoaded: !!isLoaded, isSignedIn: !!isSignedIn, userId: userId ?? null }, initial, clientMaybeSignedIn);
}
