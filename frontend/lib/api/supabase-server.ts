import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { encryptSecret } from '@/../backend/worker/security/encryption';

type JobStatus = 'uploaded' | 'processing' | 'completed' | 'failed_retryable' | 'failed_terminal';

const ALLOWED_AI_PROVIDERS = new Set(['groq', 'openrouter']);

export type UploadJobRecord = {
  id: string;
  status: JobStatus;
  clientRecordingId: string;
  idempotencyKey: string;
  audioStorageKey: string | null;
  audioMimeType: string;
  audioDurationMs: number | null;
  createdAt: string;
  updatedAt: string;
};

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured');
  }

  return createClient(url, key, { auth: { persistSession: false } });
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
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string
  };
}

export async function getUploadJobByIdempotencyKey(userId: string, idempotencyKey: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('processing_jobs')
    .select('id,status,client_recording_id,idempotency_key,audio_storage_key,audio_mime_type,audio_duration_ms,created_at,updated_at')
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
    audio_duration_ms: input.durationMs
  };

  const { data, error } = await supabase
    .from('processing_jobs')
    .insert(payload)
    .select('id,status,client_recording_id,idempotency_key,audio_storage_key,audio_mime_type,audio_duration_ms,created_at,updated_at')
    .single();

  if (error) {
    if (error.code === '23505') {
      const existing = await getUploadJobByIdempotencyKey(input.userId, input.idempotencyKey);
      if (existing) {
        return { ...existing, wasDuplicate: true as const };
      }
    }
    throw error;
  }

  return { ...mapUploadJob(data as Record<string, unknown>), wasDuplicate: false as const };
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
  config: {
    primaryProvider: string;
    transcriptionModel: string;
    categorizationModel: string;
    fallbackProvider?: string;
    fallbackTranscriptionModel?: string;
    fallbackCategorizationModel?: string;
  }
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
      fallback_categorization_model: config.fallbackCategorizationModel ?? null
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
      .select('primary_provider,transcription_model,categorization_model,fallback_provider,fallback_transcription_model,fallback_categorization_model')
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
    providersWithKey: (credsResult.data ?? []).map((row) => row.provider)
  };
}

export async function upsertCredential(userId: string, provider: string, apiKey: string) {
  const normalizedProvider = provider.trim().toLowerCase();
  if (!ALLOWED_AI_PROVIDERS.has(normalizedProvider)) {
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
  const [categoriesResult, notesResult] = await Promise.all([
    supabase.from('categories').select('id,parent_id,name').eq('user_id', userId).order('name', { ascending: true }),
    supabase
      .from('notes')
      .select('id,category_id,text,created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
  ]);

  if (categoriesResult.error) throw categoriesResult.error;
  if (notesResult.error) throw notesResult.error;

  const categories = categoriesResult.data ?? [];
  const notes = notesResult.data ?? [];

  const byParent = new Map<string | undefined, Array<{ id: string; name: string }>>();
  for (const category of categories) {
    const key = (category.parent_id as string | null) ?? undefined;
    const arr = byParent.get(key) ?? [];
    arr.push({ id: category.id as string, name: category.name as string });
    byParent.set(key, arr);
  }

  const notesByCategory = new Map<string, Array<{ id: string; text: string; createdAt: string }>>();
  for (const note of notes) {
    const arr = notesByCategory.get(note.category_id as string) ?? [];
    arr.push({
      id: note.id as string,
      text: note.text as string,
      createdAt: note.created_at as string
    });
    notesByCategory.set(note.category_id as string, arr);
  }

  function build(parentId?: string): unknown[] {
    const siblings = (byParent.get(parentId) ?? []).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    return siblings.map((category) => ({
      id: category.id,
      name: category.name,
      notes: (notesByCategory.get(category.id) ?? []).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() || a.id.localeCompare(b.id)
      ),
      children: build(category.id)
    }));
  }

  return build(undefined);
}
