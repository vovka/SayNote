import { Pool, PoolClient } from 'pg';

export interface ProcessingJobRow {
  id: string;
  user_id: string;
  status: 'uploaded' | 'processing' | 'completed' | 'failed_retryable' | 'failed_terminal';
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
}

export interface UserAICredentialRow {
  user_id: string;
  provider: string;
  encrypted_api_key: string;
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
              fallback_provider, fallback_transcription_model, fallback_categorization_model
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
