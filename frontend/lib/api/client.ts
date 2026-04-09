import { getSupabaseBrowserClient } from '@/lib/supabase/browser';
import type { AIConfigResponse } from '@/lib/settings/ai-config-form';
import type { AIProviderConfigInput } from '@/../shared/types/model-policy';

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

export async function getJob(jobId: string) {
  const response = await authFetch(`/api/jobs/${jobId}`, { cache: 'no-store' });
  if (!response.ok) throw new Error('Job lookup failed');
  return response.json() as Promise<{ job_id: string; status: 'uploaded' | 'processing' | 'completed' | 'failed_retryable' | 'failed_terminal'; error_code: string | null }>;
}

export interface NoteSummary {
  id: string;
  text: string;
  createdAt: string;
  status?: string;
  sourceJobId?: string;
  clientRecordingId?: string;
}

export interface NoteCategoryTreeNode {
  id: string;
  name: string;
  path: string;
  depth: number;
  isLocked: boolean;
  notes: NoteSummary[];
  children: NoteCategoryTreeNode[];
}

export async function getNotes() {
  const response = await authFetch('/api/notes', { cache: 'no-store' });
  if (!response.ok) return [];
  return response.json() as Promise<NoteCategoryTreeNode[]>;
}

export async function getCategories(format: 'tree' | 'flat' = 'tree') {
  const suffix = format === 'flat' ? '?format=flat' : '';
  const response = await authFetch(`/api/categories${suffix}`, { cache: 'no-store' });
  if (!response.ok) throw new Error('Failed to load categories');
  return response.json();
}

export async function updateCategoryLock(categoryId: string, isLocked: boolean) {
  const response = await authFetch(`/api/categories/${categoryId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ isLocked })
  });
  if (!response.ok) throw new Error('Failed to update category lock');
  return response.json();
}

export async function getAIConfig() {
  const response = await authFetch('/api/settings/ai-config', { cache: 'no-store' });
  if (!response.ok) throw new Error('Failed to load AI config');
  return response.json() as Promise<AIConfigResponse>;
}

export async function putAIConfig(input: AIProviderConfigInput) {
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
