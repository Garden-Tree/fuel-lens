'use client';

import { useEffect, useRef } from 'react';
import { useAuth, useUser } from '@clerk/nextjs';
import { AUTH_TOKEN_ERROR_MESSAGE, getSupabaseClient, isAuthTokenError } from '@/lib/supabaseClient';
import { reportSupabaseFailure } from '@/lib/supabaseHealth';

/**
 * ログイン中のユーザーを Supabase の users テーブルへ同期する（1 ユーザーにつきセッション中 1 回）。
 */
export default function UserSync() {
  const { getToken, userId, isSignedIn } = useAuth();
  const { user } = useUser();
  // 同期済みの userId を保持する。同一タブでアカウントを切り替えた場合も新しいユーザーを同期できる。
  const syncedUserIdRef = useRef<string | null>(null);

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
