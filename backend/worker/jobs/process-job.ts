import type { PoolClient, QueryResult } from 'pg';
import { getProvider } from '../providers/registry';
import { normalizeCategoryPath } from '../categories/resolve-category-path';
import { decryptSecret } from '../security/encryption';
import { loadJobDependencies, markJobFailed, type ProcessingJobRow } from '../db';

const MAX_RETRIES = Number(process.env.WORKER_MAX_RETRIES ?? 5);

function errorToSafeMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message.slice(0, 512);
  }
  return 'Unknown processing error';
}

async function findOrCreateCategoryId(client: PoolClient, userId: string, categoryPath: string[]) {
  let parentId: string | null = null;
  for (const segment of categoryPath) {
    const existing: QueryResult<{ id: string }> = await client.query(
      `select id from categories where user_id = $1 and parent_id is not distinct from $2 and name = $3 limit 1`,
      [userId, parentId, segment]
    );

    if (existing.rowCount && existing.rows[0]) {
      parentId = existing.rows[0].id;
      continue;
    }

    const created: QueryResult<{ id: string }> = await client.query(
      `insert into categories (user_id, parent_id, name)
       values ($1, $2, $3)
       on conflict (user_id, parent_id, name)
       do update set updated_at = now()
       returning id`,
      [userId, parentId, segment]
    );

    parentId = created.rows[0].id;
  }

  if (!parentId) {
    throw new Error('Model returned an empty category path');
  }

  return parentId;
}

export async function processJob(client: PoolClient, job: ProcessingJobRow) {
  try {
    if (!job.audio_storage_key) {
      throw new Error('Missing audio storage key');
    }

    const { config, credential } = await loadJobDependencies(client, job.user_id);
    const apiKey = await decryptSecret(credential.encrypted_api_key);

    const adapter = getProvider(config.primary_provider);
    const transcription = await adapter.transcribe({
      model: config.transcription_model,
      apiKey,
      audioUrl: job.audio_storage_key
    });

    const categorization = await adapter.categorize({
      text: transcription.text,
      model: config.categorization_model,
      apiKey
    });

    const categoryPath = normalizeCategoryPath(categorization.categoryPath);

    await client.query('begin');
    try {
      const existingNote: QueryResult<{ id: string }> = await client.query(
        'select id from notes where source_job_id = $1 limit 1',
        [job.id]
      );

      if (!existingNote.rowCount) {
        const categoryId = await findOrCreateCategoryId(client, job.user_id, categoryPath);

        await client.query(
          `insert into notes (user_id, category_id, source_job_id, text, metadata)
           values ($1, $2, $3, $4, $5::jsonb)`,
          [
            job.user_id,
            categoryId,
            job.id,
            transcription.text,
            JSON.stringify({ provider: config.primary_provider, categoryPath })
          ]
        );
      }

      await client.query(
        `update processing_jobs
         set status = 'completed',
             provider_used = $2,
             transcription_model = $3,
             categorization_model = $4,
             completed_at = now(),
             updated_at = now(),
             error_code = null,
             error_message_safe = null
         where id = $1`,
        [job.id, config.primary_provider, config.transcription_model, config.categorization_model]
      );

      await client.query('commit');
      return { status: 'completed' as const };
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  } catch (error) {
    const retryCount = job.retry_count + 1;
    const terminal = retryCount >= MAX_RETRIES;

    await markJobFailed(client, {
      jobId: job.id,
      retryCount,
      errorCode: terminal ? 'PROCESSING_TERMINAL' : 'PROCESSING_RETRYABLE',
      errorMessageSafe: errorToSafeMessage(error),
      terminal
    });

    return { status: terminal ? ('failed_terminal' as const) : ('failed_retryable' as const) };
  }
}
