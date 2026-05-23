'use client';

import { useEffect, useRef } from 'react';
import { useAuth, useUser } from '@clerk/nextjs';
import { createClerkSupabaseClient } from '@/lib/supabaseClient';

export default function UserSync() {
  const { getToken, userId, isSignedIn } = useAuth();
  const { user } = useUser();
  const syncedRef = useRef(false);

  useEffect(() => {
    if (!isSignedIn || !userId || !user || syncedRef.current) return;

    const syncUser = async () => {
      try {
        const token = await getToken({ template: 'supabase' });
        if (!token) return;

        const supabase = createClerkSupabaseClient(token);
        const email = user.primaryEmailAddress?.emailAddress || 'no-email@example.com';

        // users テーブルにデータを upsert（すでに存在すればスキップ、無ければ挿入）
        const { error } = await supabase.from('users').upsert(
          {
            id: userId,
            email: email,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        );

        if (error) {
          console.error('Supabaseへのユーザー同期に失敗しました:', error);
        } else {
          syncedRef.current = true;
        }
      } catch (err) {
        console.error('ユーザー同期中にエラーが発生しました:', err);
      }
    };

    syncUser();
  }, [isSignedIn, userId, user, getToken]);

  return null;
}
