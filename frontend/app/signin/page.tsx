'use client';

import { useSearchParams } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';

export default function SignInPage() {
  const params = useSearchParams();

  async function signInWithGoogle() {
    const supabase = getSupabaseBrowserClient();
    const redirectTo = `${window.location.origin}/auth/callback`;
    const next = params.get('next') || '/';

    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: { next }
      }
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
