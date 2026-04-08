'use client';

import { createClient } from '@supabase/supabase-js';

let client: ReturnType<typeof createClient> | undefined;

export function getSupabaseBrowserClient() {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be configured');
  }

  client = createClient(url, anonKey, {
    auth: {
      detectSessionInUrl: false,
      flowType: 'pkce'
    }
  });
  return client;
}
