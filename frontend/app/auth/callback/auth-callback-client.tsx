'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSafeNextPath } from '@/lib/auth/redirect';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';

export default function AuthCallbackClient() {
  const params = useSearchParams();
  const router = useRouter();
  const [message, setMessage] = useState('Signing you in…');

  useEffect(() => {
    async function completeSignIn() {
      const supabase = getSupabaseBrowserClient();
      const code = params.get('code');
      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      const next = getSafeNextPath(params.get('next'));
      const errorMessage =
        params.get('error_description') ??
        hashParams.get('error_description') ??
        params.get('error') ??
        hashParams.get('error');

      if (errorMessage) {
        setMessage(errorMessage);
        return;
      }

      if (!code) {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          router.replace(next);
          return;
        }

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
