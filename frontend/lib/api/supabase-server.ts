import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { encryptSecret } from '@/../backend/worker/security/encryption';
import { isSupportedProvider, type ValidatedAIProviderConfig } from '@/../shared/types/model-policy';
import { createIdempotentUploadJob } from './upload-invariants';

type JobStatus = 'uploaded' | 'processing' | 'completed' | 'failed_retryable' | 'failed_terminal';

export type UploadJobRecord = {
  id: string;
  status: JobStatus;
  clientRecordingId: string;
  idempotencyKey: string;
  audioStorageKey: string | null;
  audioMimeType: string;
  audioDurationMs: number | null;
  clientCreatedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type CategoryRow = {
  id: string;
  parent_id: string | null;
  name: string;
  path_cache: string | null;
  is_locked: boolean;
};

export type CategoryTreeNode = {
  id: string;
  name: string;
  path: string;
  depth: number;
  isLocked: boolean;
  children: CategoryTreeNode[];
};

type CategoryPatchInput = {
  isLocked?: boolean;
  name?: string;
};

type CredentialUpdateAttemptRow = {
  created_at: string;
};

const CREDENTIAL_UPDATE_RATE_LIMIT_WINDOW_MS = 60_000;
const CREDENTIAL_UPDATE_RATE_LIMIT_MAX_UPDATES = 5;

let supabaseClient: ReturnType<typeof createClient> | null = null;

function getSupabase() {
  if (supabaseClient) return supabaseClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured');
  }
  supabaseClient = createClient(url, key, { auth: { persistSession: false } });
  return supabaseClient;
}

function mapUploadJob(data: Record<string, unknown>): UploadJobRecord {
  return {
    id: data.id as string,
    status: data.status as JobStatus,
    clientRecordingId: data.client_recording_id as string,
    idempotencyKey: data.idempotency_key as string,
    audioStorageKey: (data.audio_storage_key as string | null) ?? null,
    audioMimeType: data.audio_mime_type as string,
    audioDurationMs: (data.audio_duration_ms as number | null) ?? null,
    clientCreatedAt: data.client_created_at as string,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string
  };
}

function sortCategories(categories: CategoryRow[]): CategoryRow[] {
  return [...categories].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

function getPath(category: CategoryRow) {
  return category.path_cache?.trim() || category.name;
}

function buildCategoriesTree(categories: CategoryRow[]): CategoryTreeNode[] {
  const byParent = new Map<string | undefined, CategoryRow[]>();

  for (const category of categories) {
    const key = category.parent_id ?? undefined;
    const siblingNodes = byParent.get(key) ?? [];
    siblingNodes.push(category);
    byParent.set(key, siblingNodes);
  }

  const build = (parentId?: string): CategoryTreeNode[] => {
    const siblings = byParent.get(parentId) ?? [];
    const sortedSiblings = [...siblings].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

    return sortedSiblings.map((category) => {
      const path = getPath(category);
      return {
        id: category.id,
        name: category.name,
        path,
        depth: path.split('>').length,
        isLocked: category.is_locked,
        children: build(category.id)
      };
    });
  };

  return build(undefined);
}

export async function getCategoriesForUser(userId: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('categories').select('id,parent_id,name,path_cache,is_locked').eq('user_id', userId);

  if (error) throw error;

  return sortCategories((data ?? []) as CategoryRow[]).map((category) => ({
    id: category.id,
    parent_id: category.parent_id,
    name: category.name,
    path: getPath(category),
    depth: getPath(category).split('>').length,
    isLocked: category.is_locked
  }));
}

export async function getCategoriesTreeForUser(userId: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('categories').select('id,parent_id,name,path_cache,is_locked').eq('user_id', userId);

  if (error) throw error;

  return buildCategoriesTree(sortCategories((data ?? []) as CategoryRow[]));
}

export async function updateCategoryLock(userId: string, categoryId: string, isLocked: boolean) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('categories')
    .update({ is_locked: isLocked, updated_at: new Date().toISOString() })
    .eq('id', categoryId)
    .eq('user_id', userId)
    .select('id,parent_id,name,path_cache,is_locked')
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as CategoryRow;
  const path = getPath(row);
  return {
    id: row.id,
    parent_id: row.parent_id,
    name: row.name,
    path,
    depth: path.split('>').length,
    isLocked: row.is_locked
  };
}

export async function renameCategoryForUser(userId: string, categoryId: string, name: string) {
  return patchCategoryForUser(userId, categoryId, { name });
}

function collectDescendantCategoryIds(categories: CategoryRow[], categoryId: string): string[] {
  const descendants: string[] = [];
  const queue = [categoryId];
  while (queue.length > 0) {
    const parentId = queue.shift();
    if (!parentId) continue;
    for (const category of categories) {
      if (category.parent_id !== parentId) continue;
      descendants.push(category.id);
      queue.push(category.id);
    }
  }
  return descendants;
}

function buildPathCacheByCategoryId(categories: CategoryRow[]): Map<string, string> {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const cache = new Map<string, string>();

  const visit = (categoryId: string): string => {
    const existingPath = cache.get(categoryId);
    if (existingPath) return existingPath;
    const category = byId.get(categoryId);
    if (!category) return '';
    const parentPath = category.parent_id ? visit(category.parent_id) : '';
    const path = parentPath ? `${parentPath}>${category.name}` : category.name;
    cache.set(categoryId, path);
    return path;
  };

  for (const category of categories) visit(category.id);
  return cache;
}

export async function patchCategoryForUser(userId: string, categoryId: string, input: CategoryPatchInput) {
  const supabase = getSupabase();
  const hasName = typeof input.name === 'string';
  const hasLock = typeof input.isLocked === 'boolean';
  if (!hasName && !hasLock) return null;

  const { data, error } = await supabase.from('categories').select('id,parent_id,name,path_cache,is_locked').eq('user_id', userId);
  if (error) throw error;

  const categories = (data ?? []) as CategoryRow[];
  const target = categories.find((category) => category.id === categoryId);
  if (!target) return null;

  const nextCategories = categories.map((category) => (
    category.id === categoryId && hasName
      ? { ...category, name: (input.name as string).trim() }
      : category
  ));
  const nextPathCacheByCategoryId = buildPathCacheByCategoryId(nextCategories);
  const descendants = collectDescendantCategoryIds(nextCategories, categoryId);
  const nextUpdatedAt = new Date().toISOString();

  const patch = { updated_at: nextUpdatedAt } as Record<string, unknown>;
  if (hasLock) patch.is_locked = input.isLocked;
  if (hasName) {
    patch.name = (input.name as string).trim();
    patch.path_cache = nextPathCacheByCategoryId.get(categoryId);
  }

  const { data: updatedTarget, error: updateError } = await supabase
    .from('categories')
    .update(patch)
    .eq('id', categoryId)
    .eq('user_id', userId)
    .select('id,parent_id,name,path_cache,is_locked')
    .maybeSingle();
  if (updateError) throw updateError;
  if (!updatedTarget) return null;

  if (hasName && descendants.length > 0) {
    const updates = descendants.map((id) => ({
      id,
      user_id: userId,
      path_cache: nextPathCacheByCategoryId.get(id),
      updated_at: nextUpdatedAt
    }));
    const { error: descendantError } = await supabase.from('categories').upsert(updates);
    if (descendantError) throw descendantError;
  }

  const row = updatedTarget as CategoryRow;
  const path = row.path_cache?.trim() || row.name;
  return { id: row.id, parent_id: row.parent_id, name: row.name, path, depth: path.split('>').length, isLocked: row.is_locked };
}

export async function deleteCategoryForUser(userId: string, categoryId: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('categories')
    .delete()
    .eq('id', categoryId)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function updateNoteForUser(userId: string, noteId: string, text: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('notes')
    .update({ text, updated_at: new Date().toISOString() })
    .eq('id', noteId)
    .eq('user_id', userId)
    .select('id,text,created_at')
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { id: data.id as string, text: data.text as string, createdAt: data.created_at as string };
}

export async function deleteNoteForUser(userId: string, noteId: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('notes')
    .delete()
    .eq('id', noteId)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function getUploadJobByIdempotencyKey(userId: string, idempotencyKey: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('processing_jobs')
    .select('id,status,client_recording_id,idempotency_key,audio_storage_key,audio_mime_type,audio_duration_ms,client_created_at,created_at,updated_at')
    .eq('user_id', userId)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return mapUploadJob(data as Record<string, unknown>);
}

export async function createUploadJob(input: {
  userId: string;
  idempotencyKey: string;
  clientRecordingId: string;
  mimeType: string;
  durationMs: number;
  clientCreatedAt: string;
  audioStorageKey: string;
}) {
  const supabase = getSupabase();

  const payload = {
    user_id: input.userId,
    client_recording_id: input.clientRecordingId,
    idempotency_key: input.idempotencyKey,
    status: 'uploaded' as JobStatus,
    audio_storage_key: input.audioStorageKey,
    audio_mime_type: input.mimeType,
    audio_duration_ms: input.durationMs,
    client_created_at: input.clientCreatedAt
  };

  return createIdempotentUploadJob({
    insert: async () => {
      const { data, error } = await supabase
        .from('processing_jobs')
        .insert(payload)
        .select('id,status,client_recording_id,idempotency_key,audio_storage_key,audio_mime_type,audio_duration_ms,client_created_at,created_at,updated_at')
        .single();

      if (error) {
        throw error;
      }

      return mapUploadJob(data as Record<string, unknown>);
    },
    loadExisting: () => getUploadJobByIdempotencyKey(input.userId, input.idempotencyKey),
    isDuplicateError: (error) => Boolean(error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === '23505')
  });
}

export async function getJobForUser(jobId: string, userId: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('processing_jobs')
    .select('id,status,error_code')
    .eq('id', jobId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function upsertAIConfig(
  userId: string,
  config: ValidatedAIProviderConfig
) {
  const supabase = getSupabase();
  const { error } = await supabase.from('user_ai_config').upsert(
    {
      user_id: userId,
      primary_provider: config.primaryProvider,
      transcription_model: config.transcriptionModel,
      categorization_model: config.categorizationModel,
      fallback_provider: config.fallbackProvider ?? null,
      fallback_transcription_model: config.fallbackTranscriptionModel ?? null,
      fallback_categorization_model: config.fallbackCategorizationModel ?? null,
      fallback_on_terminal_primary_failure: config.fallbackOnTerminalPrimaryFailure
    },
    { onConflict: 'user_id' }
  );
  if (error) throw error;
}

export async function getAIConfig(userId: string) {
  const supabase = getSupabase();

  const [configResult, credsResult] = await Promise.all([
    supabase
      .from('user_ai_config')
      .select('primary_provider,transcription_model,categorization_model,fallback_provider,fallback_transcription_model,fallback_categorization_model,fallback_on_terminal_primary_failure')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase.from('user_ai_credentials').select('provider').eq('user_id', userId)
  ]);

  if (configResult.error) throw configResult.error;
  if (credsResult.error) throw credsResult.error;

  const config = configResult.data;
  return {
    primaryProvider: config?.primary_provider ?? null,
    transcriptionModel: config?.transcription_model ?? null,
    categorizationModel: config?.categorization_model ?? null,
    fallbackProvider: config?.fallback_provider ?? null,
    fallbackTranscriptionModel: config?.fallback_transcription_model ?? null,
    fallbackCategorizationModel: config?.fallback_categorization_model ?? null,
    fallbackOnTerminalPrimaryFailure: config?.fallback_on_terminal_primary_failure ?? false,
    providersWithKey: (credsResult.data ?? []).map((row) => row.provider)
  };
}

export async function checkCredentialUpdateRateLimit(userId: string) {
  const supabase = getSupabase();
  const now = Date.now();
  const windowStartedAt = new Date(now - CREDENTIAL_UPDATE_RATE_LIMIT_WINDOW_MS).toISOString();

  const { data, error } = await supabase
    .from('ai_credential_update_attempts')
    .select('created_at')
    .eq('user_id', userId)
    .gte('created_at', windowStartedAt)
    .order('created_at', { ascending: true });

  if (error) throw error;

  const recentAttempts = (data ?? []) as CredentialUpdateAttemptRow[];
  if (recentAttempts.length >= CREDENTIAL_UPDATE_RATE_LIMIT_MAX_UPDATES) {
    const oldestAttempt = recentAttempts[0]?.created_at;
    const oldestAttemptMs = oldestAttempt ? Date.parse(oldestAttempt) : now;
    const retryAfterMs = Math.max(0, CREDENTIAL_UPDATE_RATE_LIMIT_WINDOW_MS - (now - oldestAttemptMs));
    return { allowed: false as const, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
  }

  const { error: insertError } = await supabase
    .from('ai_credential_update_attempts')
    .insert({ user_id: userId });

  if (insertError) throw insertError;
  return { allowed: true as const };
}

export async function upsertCredential(userId: string, provider: string, apiKey: string) {
  const normalizedProvider = provider.trim().toLowerCase();
  if (!isSupportedProvider(normalizedProvider)) {
    throw new Error('Unsupported provider');
  }

  const supabase = getSupabase();
  const encryptedKey = await encryptSecret(apiKey);
  const keyFingerprint = createHash('sha256').update(apiKey).digest('hex').slice(0, 12);

  const { error } = await supabase.from('user_ai_credentials').upsert(
    {
      user_id: userId,
      provider: normalizedProvider,
      encrypted_api_key: encryptedKey,
      key_fingerprint: keyFingerprint
    },
    { onConflict: 'user_id,provider' }
  );

  if (error) throw error;
}

export async function getNotesTreeForUser(userId: string) {
  const supabase = getSupabase();
  const [categories, notesResult] = await Promise.all([
    getCategoriesTreeForUser(userId),
    supabase
      .from('notes')
      .select('id,category_id,text,created_at,source_job_id,metadata')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
  ]);

  if (notesResult.error) throw notesResult.error;

  const notes = notesResult.data ?? [];
  const sourceJobIds = Array.from(new Set(
    notes
      .map((note) => note.source_job_id as string | null)
      .filter((value): value is string => Boolean(value))
  ));
  const jobIdToClientRecordingId = await loadClientRecordingIds(supabase, userId, sourceJobIds);

  const notesByCategory = new Map<string, Array<{
    id: string;
    text: string;
    createdAt: string;
    sourceJobId?: string;
    clientRecordingId?: string;
    lifecycleStage: 'note_visible';
  }>>();
  for (const note of notes) {
    const arr = notesByCategory.get(note.category_id as string) ?? [];
    const metadata = parseNoteMetadata(note.metadata);
    const sourceJobId = (note.source_job_id as string | null) ?? metadata.sourceJobId;
    arr.push({
      id: note.id as string,
      text: note.text as string,
      createdAt: note.created_at as string,
      sourceJobId: sourceJobId ?? undefined,
      clientRecordingId: metadata.clientRecordingId ?? (sourceJobId ? jobIdToClientRecordingId.get(sourceJobId) : undefined),
      lifecycleStage: 'note_visible'
    });
    notesByCategory.set(note.category_id as string, arr);
  }

  const attachNotes = (nodes: CategoryTreeNode[]): unknown[] =>
    nodes.map((category) => ({
      id: category.id,
      name: category.name,
      path: category.path,
      depth: category.depth,
      isLocked: category.isLocked,
      notes: (notesByCategory.get(category.id) ?? []).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() || a.id.localeCompare(b.id)
      ),
      children: attachNotes(category.children)
    }));

  return attachNotes(categories);
}

interface NoteMetadata {
  sourceJobId?: string;
  clientRecordingId?: string;
}

function parseNoteMetadata(rawMetadata: unknown): NoteMetadata {
  if (!rawMetadata || typeof rawMetadata !== 'object') return {};
  const metadata = rawMetadata as Record<string, unknown>;
  return {
    sourceJobId: typeof metadata.sourceJobId === 'string' ? metadata.sourceJobId : undefined,
    clientRecordingId: typeof metadata.clientRecordingId === 'string' ? metadata.clientRecordingId : undefined
  };
}

async function loadClientRecordingIds(
  supabase: ReturnType<typeof getSupabase>,
  userId: string,
  sourceJobIds: string[]
): Promise<Map<string, string>> {
  if (sourceJobIds.length === 0) return new Map();
  const jobsResult = await supabase
    .from('processing_jobs')
    .select('id,client_recording_id')
    .eq('user_id', userId)
    .in('id', sourceJobIds);

  if (jobsResult.error) throw jobsResult.error;

  return new Map(
    (jobsResult.data ?? [])
      .filter((job) => typeof job.id === 'string' && typeof job.client_recording_id === 'string')
      .map((job) => [job.id as string, job.client_recording_id as string])
  );
}
