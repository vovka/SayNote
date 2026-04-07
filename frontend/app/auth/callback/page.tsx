'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';

export default function AuthCallbackPage() {
  const params = useSearchParams();
  const router = useRouter();
  const [message, setMessage] = useState('Signing you in…');

  useEffect(() => {
    async function completeSignIn() {
      const supabase = getSupabaseBrowserClient();
      const code = params.get('code');
      const next = params.get('next') || '/';

      if (!code) {
        setMessage('Missing auth code. Please try signing in again.');
        return;
      }

      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        setMessage(error.message);
        return;
      }

      router.replace(next);
    }

    void completeSignIn();
  }, [params, router]);

  return <main><p>{message}</p></main>;
}
