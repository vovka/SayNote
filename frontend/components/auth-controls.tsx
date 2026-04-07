'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';

export function AuthControls() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  async function signOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace('/signin');
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
      <small>{email ?? 'Signed in'}</small>
      <button onClick={signOut}>Sign out</button>
    </div>
  );
}
