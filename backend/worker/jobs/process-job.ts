import type { PoolClient, QueryResult } from 'pg';
import { getProvider } from '../providers/registry';
import { normalizeCategoryPath } from '../categories/resolve-category-path';
import { decryptSecretForWorker } from '../security/decrypt-for-worker';
import { loadJobDependencies, markJobFailed, type ProcessingJobRow } from '../db';
import { isProviderError, safeErrorMessage, type ProviderFailureKind } from '../providers/errors';

const MAX_RETRIES = Number(process.env.WORKER_MAX_RETRIES ?? 5);

interface ProcessingAttempt {
  provider: string;
  transcriptionModel: string;
  categorizationModel: string;
}

function getAttempts(config: {
  primary_provider: string;
  transcription_model: string;
  categorization_model: string;
  fallback_provider: string | null;
  fallback_transcription_model: string | null;
  fallback_categorization_model: string | null;
}) {
  const attempts: ProcessingAttempt[] = [
    {
      provider: config.primary_provider,
      transcriptionModel: config.transcription_model,
      categorizationModel: config.categorization_model
    }
  ];

  if (config.fallback_provider && config.fallback_transcription_model && config.fallback_categorization_model) {
    attempts.push({
      provider: config.fallback_provider,
      transcriptionModel: config.fallback_transcription_model,
      categorizationModel: config.fallback_categorization_model
    });
  }

  return attempts;
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

    const { config, credentialsByProvider } = await loadJobDependencies(client, job.user_id);
    const attempts = getAttempts(config);

    let completedAttempt: ProcessingAttempt | null = null;
    let transcriptionText = '';
    let categoryPath: string[] = [];
    let lastFailure: unknown;

    for (let index = 0; index < attempts.length; index += 1) {
      const attempt = attempts[index];
      const credential = credentialsByProvider.get(attempt.provider);
      if (!credential) {
        lastFailure = new Error(`AI credential missing for provider ${attempt.provider}`);
        break;
      }

      try {
        const apiKey = await decryptSecretForWorker(credential.encrypted_api_key);
        const adapter = getProvider(attempt.provider);

        const transcription = await adapter.transcribe({
          model: attempt.transcriptionModel,
          apiKey,
          audioUrl: job.audio_storage_key
        });

        const categorization = await adapter.categorize({
          text: transcription.text,
          model: attempt.categorizationModel,
          apiKey
        });

        transcriptionText = transcription.text;
        categoryPath = normalizeCategoryPath(categorization.categoryPath);
        completedAttempt = attempt;
        break;
      } catch (error) {
        lastFailure = error;
        const retryable = isProviderError(error) ? error.kind === 'retryable' : true;
        const hasFallback = index < attempts.length - 1;
        if (!retryable || !hasFallback) {
          break;
        }
      }
    }

    if (!completedAttempt) {
      throw lastFailure ?? new Error('Failed to process job');
    }

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
            transcriptionText,
            JSON.stringify({ provider: completedAttempt.provider, categoryPath })
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
        [job.id, completedAttempt.provider, completedAttempt.transcriptionModel, completedAttempt.categorizationModel]
      );

      await client.query('commit');
      return { status: 'completed' as const };
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  } catch (error) {
    const requestedRetryCount = job.retry_count + 1;
    const failureKind: ProviderFailureKind = isProviderError(error) ? error.kind : 'retryable';
    const terminal = failureKind === 'terminal' || requestedRetryCount >= MAX_RETRIES;

    await markJobFailed(client, {
      jobId: job.id,
      retryCount: requestedRetryCount,
      errorCode: isProviderError(error)
        ? `PROVIDER_${error.provider.toUpperCase()}_${error.code}`
        : terminal
          ? 'PROCESSING_TERMINAL'
          : 'PROCESSING_RETRYABLE',
      errorMessageSafe: safeErrorMessage(error),
      terminal
    });

    return { status: terminal ? ('failed_terminal' as const) : ('failed_retryable' as const) };
  }
}
