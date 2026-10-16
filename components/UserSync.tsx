'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, useUser } from '@clerk/nextjs';
import { setClientSentryUser } from '@/lib/sentry/client';
import { AUTH_TOKEN_ERROR_MESSAGE, getSupabaseClient, isAuthTokenError } from '@/lib/supabaseClient';
import { reportSupabaseFailure } from '@/lib/supabaseHealth';

/**
 * ログイン中のユーザーを Supabase の users テーブルへ同期する（1 ユーザーにつきセッション中 1 回）。
 * あわせて、ログイン状態（ユーザー）が変わったらクライアントのルーターキャッシュを捨てる（router.refresh()）。
 * next.config.ts の staleTimes で 30 秒以内の再訪はキャッシュから表示するため、ログアウト・ユーザー切り替えの前の
 * サーバーの描画結果（レイアウトの初期認証状態など）を使い回さないようにする。
 */
export default function UserSync() {
  const { getToken, userId, isSignedIn, isLoaded } = useAuth();
  const router = useRouter();
  // 前回見たユーザー（undefined = Clerk の読み込み前でまだ見ていない）
  const seenUserRef = useRef<string | null | undefined>(undefined);
  const { user } = useUser();
  // 同期済みの userId を保持する。同一タブでアカウントを切り替えた場合も新しいユーザーを同期できる。
  const syncedUserIdRef = useRef<string | null>(null);

  // エラー報告にユーザー ID だけを紐づける（メールや IP は送らない。lib/sentry/scrub.ts）。DSN 未設定なら何もしない
  useEffect(() => {
    setClientSentryUser(isSignedIn && userId ? userId : null);
  }, [isSignedIn, userId]);

  useEffect(() => {
    if (!isLoaded) return;
    const current = isSignedIn && userId ? userId : null;
    if (seenUserRef.current !== undefined && seenUserRef.current !== current) router.refresh();
    seenUserRef.current = current;
  }, [isLoaded, isSignedIn, userId, router]);

  useEffect(() => {
    if (!isSignedIn || !userId || !user) return;
    if (syncedUserIdRef.current === userId) return;

    let cancelled = false;

    const syncUser = async () => {
      try {
        const supabase = getSupabaseClient(userId, getToken);
        // メールアドレスが無い場合はダミー値を入れず null を送る
        const email = user.primaryEmailAddress?.emailAddress ?? null;

        // users テーブルにデータを upsert（すでに存在すれば更新、無ければ挿入）
        const { error, status } = await supabase.from('users').upsert(
          {
            id: userId,
            email,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        );

        if (cancelled) return;
        if (error) {
          console.error('Supabaseへのユーザー同期に失敗しました:', error);
          // 認証トークン欠落は障害ではない（再ログイン案内は各データフックが表示する）。
          // 障害として報告するとアプリ全体が閲覧専用になり、本当の原因が隠れてしまう。
          if (isAuthTokenError(error)) console.error(AUTH_TOKEN_ERROR_MESSAGE);
          else reportSupabaseFailure(status, error);
        } else {
          syncedUserIdRef.current = userId;
        }
      } catch (err) {
        if (cancelled) return;
        console.error('ユーザー同期中にエラーが発生しました:', err);
        if (isAuthTokenError(err)) console.error(AUTH_TOKEN_ERROR_MESSAGE);
        else reportSupabaseFailure(undefined, err);
      }
    };

    syncUser();
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, userId, user, getToken]);

  return null;
}
