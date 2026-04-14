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

async function readApiError(response: Response, fallbackMessage: string) {
  const payload = await response.json().catch(() => null) as { error?: unknown; errorCode?: unknown } | null;
  return typeof payload?.error === 'string' ? payload.error : fallbackMessage;
}

export async function uploadAudio(formData: FormData) {
  const response = await authFetch('/api/audio/upload', { method: 'POST', body: formData });
  if (!response.ok) throw new Error('Upload failed');
  return response.json();
}

export async function getJob(jobId: string) {
  const response = await authFetch(`/api/jobs/${jobId}`, { cache: 'no-store' });
  if (!response.ok) throw new Error('Job lookup failed');
  return response.json() as Promise<{
    job_id: string;
    status: 'uploaded' | 'processing' | 'completed' | 'failed_retryable' | 'failed_terminal';
    lifecycle_stage: string;
    error_code: string | null;
  }>;
}

export interface NoteSummary {
  id: string;
  text: string;
  createdAt: string;
  status?: string;
  sourceJobId?: string;
  clientRecordingId?: string;
  lifecycleStage?: string;
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

export async function renameCategory(categoryId: string, name: string) {
  const response = await authFetch(`/api/categories/${categoryId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name })
  });
  if (!response.ok) throw new Error('Failed to rename category');
  return response.json();
}

export async function deleteCategory(categoryId: string) {
  const response = await authFetch(`/api/categories/${categoryId}`, { method: 'DELETE' });
  if (!response.ok) throw new Error(await readApiError(response, 'Failed to delete category'));
  return response.json();
}

export async function updateNote(noteId: string, text: string) {
  const response = await authFetch(`/api/notes/${noteId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text })
  });
  if (!response.ok) throw new Error('Failed to update note');
  return response.json();
}

export async function deleteNote(noteId: string) {
  const response = await authFetch(`/api/notes/${noteId}`, { method: 'DELETE' });
  if (!response.ok) throw new Error('Failed to delete note');
  return response.json();
}

export async function getAIConfig() {
  const response = await authFetch('/api/settings/ai-config', { cache: 'no-store' });
  if (!response.ok) throw new Error('Failed to load AI config');
  return response.json() as Promise<AIConfigResponse>;
}

export async function putAIConfig(
  input: AIProviderConfigInput,
  transcriptionPreferences?: { transcriptionMode: string; liveTranscriptionLanguage: string }
) {
  const response = await authFetch('/api/settings/ai-config', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...input, transcriptionPreferences })
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

export async function fetchAzureToken() {
  const response = await authFetch('/api/speech/azure-token', { cache: 'no-store' });
  if (!response.ok) throw new Error('Failed to fetch Azure Speech token');
  return response.json() as Promise<{ token: string; region: string; expiresAt: string }>;
}

export async function finalizeLiveNote(payload: {
  text: string;
  createdAt: string;
  durationMs: number;
  speechLanguage: string;
  clientSessionId: string;
  clientRecordingId: string;
  transcriptionSource: 'azure_live';
}) {
  const response = await authFetch('/api/notes/live', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { errorCode?: string };
    throw Object.assign(new Error('Failed to finalize live note'), { errorCode: body.errorCode });
  }
  return response.json() as Promise<{
    note: { id: string; jobId: string };
    notesTree: NoteCategoryTreeNode[];
  }>;
}

export async function getCurrentUserId() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}
