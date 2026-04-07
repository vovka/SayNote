import type { PoolClient, QueryResult } from 'pg';
import { getProvider } from '../providers/registry';
import { normalizeCategoryPath, resolveCategoryPath } from '../categories/resolve-category-path';
import { decryptSecret } from '../security/encryption';
import { loadJobDependencies, markJobFailed, type ProcessingJobRow } from '../db';
import { isProviderError, ProviderError, safeErrorMessage, type ProviderFailureKind } from '../providers/errors';
import { logWorkerFailure, scrubSensitiveFields } from '../security/safe-logging';
import { deleteTemporaryAudio, getTemporaryAudio, isR2ReadError } from '../storage/r2';
import { cleanupTemporaryAudioAfterCompletion } from './cleanup-temporary-audio';
import { getAttempts, shouldTryFallback, type ProcessingAttempt } from './attempt-policy';

const MAX_RETRIES = Number(process.env.WORKER_MAX_RETRIES ?? 5);

interface ProcessJobDependencies {
  getTemporaryAudio: typeof getTemporaryAudio;
  deleteTemporaryAudio: typeof deleteTemporaryAudio;
  loadJobDependencies: typeof loadJobDependencies;
  decryptSecret: typeof decryptSecret;
  getProvider: typeof getProvider;
  resolveCategoryPath: typeof resolveCategoryPath;
  markJobFailed: typeof markJobFailed;
  logWorkerFailure: typeof logWorkerFailure;
  cleanupTemporaryAudioAfterCompletion: typeof cleanupTemporaryAudioAfterCompletion;
}

const defaultProcessJobDependencies: ProcessJobDependencies = {
  getTemporaryAudio,
  deleteTemporaryAudio,
  loadJobDependencies,
  decryptSecret,
  getProvider,
  resolveCategoryPath,
  markJobFailed,
  logWorkerFailure,
  cleanupTemporaryAudioAfterCompletion
};

export async function processJob(
  client: PoolClient,
  job: ProcessingJobRow,
  deps: ProcessJobDependencies = defaultProcessJobDependencies
) {
  try {
    if (!job.audio_storage_key) {
      throw new Error('Missing audio storage key');
    }

    const audio = await deps.getTemporaryAudio(job.audio_storage_key).catch((error: unknown) => {
      if (!isR2ReadError(error)) {
        throw error;
      }

      throw new ProviderError({
        provider: 'r2',
        operation: 'transcribe',
        kind: error.kind,
        code: error.code,
        safeMessage: error.safeMessage,
        cause: error
      });
    });

    const { config, credentialsByProvider } = await deps.loadJobDependencies(client, job.user_id);
    const attemptPlan = getAttempts(config);
    const { attempts, fallbackOnTerminalPrimaryFailure } = attemptPlan;

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
        const apiKey = await deps.decryptSecret(credential.encrypted_api_key);
        const adapter = deps.getProvider(attempt.provider);

        const transcription = await adapter.transcribe({
          model: attempt.transcriptionModel,
          apiKey,
          audioBuffer: audio.buffer,
          metadata: {
            storageKey: job.audio_storage_key,
            contentType: audio.contentType
          }
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
        const hasFallback = index < attempts.length - 1;
        if (
          !shouldTryFallback({
            error,
            attempt,
            hasFallback,
            fallbackOnTerminalPrimaryFailure
          })
        ) {
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
        const categoryId = await deps.resolveCategoryPath(client, job.user_id, categoryPath);

        await client.query(
          `insert into notes (user_id, category_id, source_job_id, text, created_at, processed_at, updated_at, metadata)
           values ($1, $2, $3, $4, $5::timestamptz, now(), now(), $6::jsonb)`,
          [
            job.user_id,
            categoryId,
            job.id,
            transcriptionText,
            job.client_created_at,
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

      await deps.cleanupTemporaryAudioAfterCompletion({
        jobId: job.id,
        userId: job.user_id,
        audioStorageKey: job.audio_storage_key,
        deleteAudio: deps.deleteTemporaryAudio,
        logFailure: deps.logWorkerFailure
      });

      return { status: 'completed' as const };
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  } catch (error) {
    const requestedRetryCount = job.retry_count + 1;
    const failureKind: ProviderFailureKind = isProviderError(error) ? error.kind : 'retryable';
    const terminal = failureKind === 'terminal' || requestedRetryCount >= MAX_RETRIES;
    const errorCode = isProviderError(error)
      ? `PROVIDER_${error.provider.toUpperCase()}_${error.code}`
      : terminal
        ? 'PROCESSING_TERMINAL'
        : 'PROCESSING_RETRYABLE';

    await deps.markJobFailed(client, {
      jobId: job.id,
      retryCount: requestedRetryCount,
      errorCode,
      errorMessageSafe: safeErrorMessage(scrubSensitiveFields(error)),
      terminal
    });

    deps.logWorkerFailure({
      jobId: job.id,
      userId: job.user_id,
      provider: isProviderError(error) ? error.provider : undefined,
      errorCode,
      error
    });

    return { status: terminal ? ('failed_terminal' as const) : ('failed_retryable' as const) };
  }
}
