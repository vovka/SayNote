import { getSupabaseBrowserClient } from '@/lib/supabase/browser';

async function authFetch(input: RequestInfo | URL, init?: RequestInit) {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const headers = new Headers(init?.headers);
  if (token) {
    headers.set('authorization', `Bearer ${token}`);
  }

  return fetch(input, {
    ...init,
    headers
  });
}

export async function uploadAudio(formData: FormData) {
  const response = await authFetch('/api/audio/upload', { method: 'POST', body: formData });
  if (!response.ok) throw new Error('Upload failed');
  return response.json();
}

export async function getNotes() {
  const response = await authFetch('/api/notes', { cache: 'no-store' });
  if (!response.ok) return [];
  return response.json();
}

export async function putAIConfig(input: {
  primaryProvider: string;
  transcriptionModel: string;
  categorizationModel: string;
}) {
  const response = await authFetch('/api/settings/ai-config', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });
  if (!response.ok) throw new Error('Failed to save AI config');
}

export async function putAICredentials(input: { provider: string; apiKey: string }) {
  const response = await authFetch('/api/settings/ai-credentials', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });
  if (!response.ok) throw new Error('Failed to save credentials');
}

export async function getCurrentUserId() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}
