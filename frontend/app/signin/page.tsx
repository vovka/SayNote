'use client';

import { useSearchParams } from 'next/navigation';
import { buildAuthCallbackUrl, getSafeNextPath } from '@/lib/auth/redirect';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';

export default function SignInPage() {
  const params = useSearchParams();

  async function signInWithGoogle() {
    const supabase = getSupabaseBrowserClient();
    const next = getSafeNextPath(params.get('next'));
    const redirectTo = buildAuthCallbackUrl(window.location.origin, next);

    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo }
    });
  }

  return (
    <main style={{ minHeight: '80vh', display: 'grid', placeItems: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <h1>Sign in to SayNote</h1>
        <button onClick={signInWithGoogle}>Continue with Google</button>
      </div>
    </main>
  );
}
