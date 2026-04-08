import { Pool, PoolClient } from 'pg';

export interface ProcessingJobRow {
  id: string;
  user_id: string;
  status: 'uploaded' | 'processing' | 'completed' | 'failed_retryable' | 'failed_terminal';
  client_created_at: string;
  audio_storage_key: string | null;
  retry_count: number;
  error_code: string | null;
  error_message_safe: string | null;
  provider_used: string | null;
  transcription_model: string | null;
  categorization_model: string | null;
}

export interface UserAIConfigRow {
  user_id: string;
  primary_provider: string;
  transcription_model: string;
  categorization_model: string;
  fallback_provider: string | null;
  fallback_transcription_model: string | null;
  fallback_categorization_model: string | null;
  fallback_on_terminal_primary_failure: boolean;
}

export interface UserAICredentialRow {
  user_id: string;
  provider: string;
  encrypted_api_key: string;
}

export interface CategoryCatalogRow {
  id: string;
  name: string;
  parent_id: string | null;
  path_cache: string;
  normalized_path_cache: string;
  is_locked: boolean;
  note_count: number;
}

export interface ExistingNoteForReviewRow {
  id: string;
  text: string;
  current_category_id: string;
  current_category_path: string;
  is_in_locked_subtree: boolean;
}

export interface ReviewCursorRow {
  user_id: string;
  cursor_after_note_id: string | null;
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run the worker.');
}

const pool = new Pool({ connectionString: databaseUrl });

export async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function claimJobs(limit: number): Promise<ProcessingJobRow[]> {
  return withClient(async (client) => {
    await client.query('begin');
    try {
      const result = await client.query<ProcessingJobRow>(
        `with candidates as (
          select id
          from processing_jobs
          where status in ('uploaded', 'failed_retryable')
          order by created_at asc
          for update skip locked
          limit $1
        )
        update processing_jobs jobs
        set status = 'processing',
            updated_at = now(),
            error_code = null,
            error_message_safe = null
        from candidates
        where jobs.id = candidates.id
        returning jobs.*`,
        [limit]
      );
      await client.query('commit');
      return result.rows;
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  });
}

export async function loadJobDependencies(client: PoolClient, userId: string) {
  const [configResult, credentialResult] = await Promise.all([
    client.query<UserAIConfigRow>(
      `select user_id, primary_provider, transcription_model, categorization_model,
              fallback_provider, fallback_transcription_model, fallback_categorization_model,
              fallback_on_terminal_primary_failure
       from user_ai_config
       where user_id = $1`,
      [userId]
    ),
    client.query<UserAICredentialRow>(
      `select user_id, provider, encrypted_api_key
       from user_ai_credentials
       where user_id = $1`,
      [userId]
    )
  ]);

  const config = configResult.rows[0];
  if (!config) {
    throw new Error('AI configuration missing for user');
  }

  const credentialsByProvider = new Map<string, UserAICredentialRow>(
    credentialResult.rows.map((row: UserAICredentialRow) => [row.provider, row])
  );
  const primaryCredential = credentialsByProvider.get(config.primary_provider);
  if (!primaryCredential) {
    throw new Error(`AI credential missing for provider ${config.primary_provider}`);
  }

  return { config, credentialsByProvider };
}

export async function loadCategoryCatalog(client: PoolClient, userId: string): Promise<CategoryCatalogRow[]> {
  const result = await client.query<CategoryCatalogRow>(
    `select c.id,
            c.name,
            c.parent_id,
            coalesce(c.path_cache, c.name) as path_cache,
            coalesce(c.normalized_path_cache, lower(trim(c.name))) as normalized_path_cache,
            c.is_locked,
            count(n.id)::int as note_count
     from categories c
     left join notes n on n.category_id = c.id
     where c.user_id = $1
     group by c.id
     order by coalesce(c.path_cache, c.name) asc, c.id asc`,
    [userId]
  );

  return result.rows;
}

export async function loadReviewCursor(client: PoolClient, userId: string): Promise<ReviewCursorRow | null> {
  const result = await client.query<ReviewCursorRow>(
    `select user_id, cursor_after_note_id
     from user_review_cursors
     where user_id = $1
     limit 1`,
    [userId]
  );

  return result.rows[0] ?? null;
}

export async function saveReviewCursor(client: PoolClient, userId: string, cursorAfterNoteId: string | null) {
  await client.query(
    `insert into user_review_cursors (user_id, cursor_after_note_id, updated_at)
     values ($1, $2, now())
     on conflict (user_id)
     do update set cursor_after_note_id = excluded.cursor_after_note_id,
                   updated_at = now()`,
    [userId, cursorAfterNoteId]
  );
}

export async function loadExistingNotesForReview(
  client: PoolClient,
  userId: string,
  options?: { limit?: number; cursorAfterNoteId?: string | null }
): Promise<ExistingNoteForReviewRow[]> {
  const limit = options?.limit ?? null;
  const cursorAfterNoteId = options?.cursorAfterNoteId ?? null;

  const result = await client.query<ExistingNoteForReviewRow>(
    `with recursive locked_categories as (
      select id, parent_id
      from categories
      where user_id = $1 and is_locked = true
      union all
      select c.id, c.parent_id
      from categories c
      inner join locked_categories lc on c.parent_id = lc.id
      where c.user_id = $1
    )
    select n.id,
           n.text,
           n.category_id as current_category_id,
           coalesce(c.path_cache, c.name) as current_category_path,
           exists(select 1 from locked_categories lc where lc.id = n.category_id) as is_in_locked_subtree
    from notes n
    inner join categories c on c.id = n.category_id
    where n.user_id = $1
      and ($2::uuid is null or n.id > $2::uuid)
    order by n.id asc
    limit coalesce($3::int, 1000000)`,
    [userId, cursorAfterNoteId, limit]
  );

  return result.rows;
}

export async function updateCategoryLockState(client: PoolClient, userId: string, categoryId: string, isLocked: boolean) {
  const result = await client.query<{ id: string; name: string; is_locked: boolean; path_cache: string }>(
    `update categories
     set is_locked = $3,
         updated_at = now()
     where id = $1 and user_id = $2
     returning id, name, is_locked, path_cache`,
    [categoryId, userId, isLocked]
  );

  return result.rows[0] ?? null;
}

export async function applyRecategorization(client: PoolClient, input: {
  noteId: string;
  userId: string;
  targetCategoryId: string;
  sourceJobId: string;
  confidence?: number;
  reason?: string;
}) {
  await client.query(
    `update notes n
     set category_id = $3,
         updated_at = now(),
         metadata = jsonb_strip_nulls(
           coalesce(n.metadata, '{}'::jsonb) || jsonb_build_object(
             'assignmentMode', 'auto_recategorization',
             'sourceJobId', $4,
             'assignmentConfidence', $5,
             'assignmentReason', $6,
             'previousCategoryId', n.category_id
           )
         )
     where n.id = $1
       and n.user_id = $2`,
    [input.noteId, input.userId, input.targetCategoryId, input.sourceJobId, input.confidence ?? null, input.reason ?? null]
  );
}

export async function markJobFailed(
  client: PoolClient,
  input: { jobId: string; retryCount: number; errorCode: string; errorMessageSafe: string; terminal: boolean }
) {
  await client.query(
    `update processing_jobs
     set status = $2,
         retry_count = $3,
         error_code = $4,
         error_message_safe = $5,
         completed_at = case when $2 = 'failed_terminal' then now() else completed_at end,
         updated_at = now()
     where id = $1`,
    [input.jobId, input.terminal ? 'failed_terminal' : 'failed_retryable', input.retryCount, input.errorCode, input.errorMessageSafe]
  );
}

export async function closePool() {
  await pool.end();
}
