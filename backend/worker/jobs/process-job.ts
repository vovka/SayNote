import type { PoolClient, QueryResult } from 'pg';
import type { CategorizeWithReviewResult } from '../../../shared/types/provider';
import { getProvider } from '../providers/registry';
import { resolveCategorySelection } from '../categories/resolve-category-path';
import { decryptSecret } from '../security/encryption';
import {
  applyRecategorization,
  loadCategoryCatalog,
  loadExistingNotesForReview,
  loadJobDependencies,
  loadReviewCursor,
  markJobFailed,
  saveReviewCursor,
  type CategoryCatalogRow,
  type ExistingNoteForReviewRow,
  type ProcessingJobRow
} from '../db';
import { isProviderError, ProviderError, safeErrorMessage, type ProviderFailureKind } from '../providers/errors';
import { logWorkerEvent, logWorkerFailure, scrubSensitiveFields } from '../security/safe-logging';
import { deleteTemporaryAudio, getTemporaryAudio, isR2ReadError } from '../storage/r2';
import { cleanupTemporaryAudioAfterCompletion } from './cleanup-temporary-audio';
import { getAttempts, shouldTryFallback, type ProcessingAttempt } from './attempt-policy';
import { buildLockedSubtreeSet } from '../categories/locked-subtree';
import { buildUnifiedCategorizationInput } from '../categories/build-unified-categorization-input';

const MAX_RETRIES = Number(process.env.WORKER_MAX_RETRIES ?? 5);

interface ProcessJobDependencies {
  getTemporaryAudio: typeof getTemporaryAudio;
  deleteTemporaryAudio: typeof deleteTemporaryAudio;
  loadJobDependencies: typeof loadJobDependencies;
  decryptSecret: typeof decryptSecret;
  getProvider: typeof getProvider;
  resolveCategorySelection: typeof resolveCategorySelection;
  markJobFailed: typeof markJobFailed;
  logWorkerFailure: typeof logWorkerFailure;
  cleanupTemporaryAudioAfterCompletion: typeof cleanupTemporaryAudioAfterCompletion;
  loadCategoryCatalog: typeof loadCategoryCatalog;
  loadExistingNotesForReview: typeof loadExistingNotesForReview;
  loadReviewCursor: typeof loadReviewCursor;
  saveReviewCursor: typeof saveReviewCursor;
  applyRecategorization: typeof applyRecategorization;
}

const defaultProcessJobDependencies: ProcessJobDependencies = {
  getTemporaryAudio,
  deleteTemporaryAudio,
  loadJobDependencies,
  decryptSecret,
  getProvider,
  resolveCategorySelection,
  markJobFailed,
  logWorkerFailure,
  cleanupTemporaryAudioAfterCompletion,
  loadCategoryCatalog,
  loadExistingNotesForReview,
  loadReviewCursor,
  saveReviewCursor,
  applyRecategorization
};

function getFailureLogPayload(error: unknown) {
  if (isProviderError(error)) {
    return {
      errorName: error.name,
      errorCode: error.code,
      failureKind: error.kind,
      operation: error.operation
    };
  }

  if (error instanceof Error) {
    return { errorName: error.name };
  }

  return {};
}

function validateAssignmentShape(assignment: { selectedCategoryId?: string; newCategoryPath?: string }) {
  if (!!assignment.selectedCategoryId === !!assignment.newCategoryPath) {
    throw new Error('Invalid unified assignment: exactly one of selectedCategoryId or newCategoryPath is required');
  }
}

function findReviewNote(noteId: string, reviewedNotes: ExistingNoteForReviewRow[]) {
  return reviewedNotes.find((note) => note.id === noteId);
}

function isCategoryLocked(categoryId: string | undefined, lockedSet: Set<string>) {
  return Boolean(categoryId && lockedSet.has(categoryId));
}

async function applyRecategorizationsBestEffort(input: {
  client: PoolClient;
  job: ProcessingJobRow;
  categories: CategoryCatalogRow[];
  reviewedNotes: ExistingNoteForReviewRow[];
  result: CategorizeWithReviewResult;
  deps: ProcessJobDependencies;
}) {
  const lockedSet = buildLockedSubtreeSet(
    input.categories.map((category) => ({ id: category.id, parent_id: category.parent_id, is_locked: category.is_locked }))
  );

  for (const recategorization of input.result.recategorizations) {
    try {
      const reviewNote = findReviewNote(recategorization.noteId, input.reviewedNotes);
      if (!reviewNote || reviewNote.is_in_locked_subtree) {
        continue;
      }

      validateAssignmentShape(recategorization);

      const targetCategoryId = await input.deps.resolveCategorySelection(input.client, {
        userId: input.job.user_id,
        selectedCategoryId: recategorization.selectedCategoryId,
        newCategoryPath: recategorization.newCategoryPath
      });

      if (targetCategoryId === reviewNote.current_category_id) {
        continue;
      }

      if (isCategoryLocked(targetCategoryId, lockedSet)) {
        continue;
      }

      await input.deps.applyRecategorization(input.client, {
        noteId: reviewNote.id,
        userId: input.job.user_id,
        targetCategoryId,
        sourceJobId: input.job.id,
        confidence: recategorization.confidence,
        reason: recategorization.reason
      });
    } catch (error) {
      logWorkerFailure({
        jobId: input.job.id,
        userId: input.job.user_id,
        errorCode: 'AUTO_RECATEGORIZATION_FAILED',
        error
      });
    }
  }
}

export async function processJob(
  client: PoolClient,
  job: ProcessingJobRow,
  deps: ProcessJobDependencies = defaultProcessJobDependencies
) {
  try {
    logWorkerEvent('worker_job_started', {
      jobId: job.id,
      userId: job.user_id,
      retryCount: job.retry_count
    });

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
    let categorization: CategorizeWithReviewResult | null = null;
    let reviewedNotes: ExistingNoteForReviewRow[] = [];
    let categories: CategoryCatalogRow[] = [];
    let nextCursorAfterNoteId: string | null = null;
    let lastFailure: unknown;

    for (let index = 0; index < attempts.length; index += 1) {
      const attempt = attempts[index];
      const credential = credentialsByProvider.get(attempt.provider);
      if (!credential) {
        lastFailure = new Error(`AI credential missing for provider ${attempt.provider}`);
        break;
      }

      try {
        logWorkerEvent('worker_job_attempt_started', {
          jobId: job.id,
          userId: job.user_id,
          attemptIndex: index + 1,
          totalAttempts: attempts.length,
          provider: attempt.provider,
          transcriptionModel: attempt.transcriptionModel,
          categorizationModel: attempt.categorizationModel
        });

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

        transcriptionText = transcription.text;
        categories = await deps.loadCategoryCatalog(client, job.user_id);
        const reviewCursor = await deps.loadReviewCursor(client, job.user_id);
        const reviewLimit = Number(process.env.WORKER_UNIFIED_REVIEW_NOTES_LIMIT ?? 300);
        reviewedNotes = await deps.loadExistingNotesForReview(client, job.user_id, {
          limit: reviewLimit * 2,
          cursorAfterNoteId: reviewCursor?.cursor_after_note_id ?? null
        });

        const unifiedInput = buildUnifiedCategorizationInput({
          newNoteText: transcription.text,
          newNoteCreatedAt: job.client_created_at,
          categories,
          existingNotes: reviewedNotes,
          reviewCursor
        });

        reviewedNotes = reviewedNotes.filter((note) => unifiedInput.reviewedNoteIds.has(note.id));
        nextCursorAfterNoteId = unifiedInput.nextCursorAfterNoteId;

        categorization = await adapter.categorizeWithReview({
          model: attempt.categorizationModel,
          apiKey,
          payload: unifiedInput.payload
        });

        validateAssignmentShape(categorization.newNoteAssignment);
        completedAttempt = attempt;
        break;
      } catch (error) {
        lastFailure = error;
        const hasFallback = index < attempts.length - 1;
        const willTryFallback = shouldTryFallback({
          error,
          attempt,
          hasFallback,
          fallbackOnTerminalPrimaryFailure
        });

        if (willTryFallback) {
          logWorkerEvent('worker_job_attempt_failed', {
            jobId: job.id,
            userId: job.user_id,
            attemptIndex: index + 1,
            totalAttempts: attempts.length,
            provider: attempt.provider,
            willTryFallback,
            ...getFailureLogPayload(error)
          });
        }

        if (!willTryFallback) {
          break;
        }
      }
    }

    if (!completedAttempt || !categorization) {
      throw lastFailure ?? new Error('Failed to process job');
    }

    let insertedNewNote = false;

    await client.query('begin');
    try {
      const existingNote: QueryResult<{ id: string }> = await client.query(
        'select id from notes where source_job_id = $1 limit 1',
        [job.id]
      );

      if (!existingNote.rowCount) {
        const categoryId = await deps.resolveCategorySelection(client, {
          userId: job.user_id,
          selectedCategoryId: categorization.newNoteAssignment.selectedCategoryId,
          newCategoryPath: categorization.newNoteAssignment.newCategoryPath
        });

        await client.query(
          `insert into notes (user_id, category_id, source_job_id, text, created_at, processed_at, updated_at, metadata)
           values ($1, $2, $3, $4, $5::timestamptz, now(), now(), $6::jsonb)`,
          [
            job.user_id,
            categoryId,
            job.id,
            transcriptionText,
            job.client_created_at,
            JSON.stringify({
              provider: completedAttempt.provider,
              assignmentMode: 'initial',
              sourceJobId: job.id,
              assignedCategoryPath: categorization.newNoteAssignment.newCategoryPath ?? null,
              assignmentConfidence: categorization.newNoteAssignment.confidence ?? null,
              assignmentReason: categorization.newNoteAssignment.reason ?? null
            })
          ]
        );
        insertedNewNote = true;
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
    } catch (error) {
      await client.query('rollback');
      throw error;
    }

    if (insertedNewNote) {
      try {
        await client.query('begin');
        await applyRecategorizationsBestEffort({
          client,
          job,
          categories,
          reviewedNotes,
          result: categorization,
          deps
        });

        if (nextCursorAfterNoteId !== null) {
          await deps.saveReviewCursor(client, job.user_id, nextCursorAfterNoteId);
        }

        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        logWorkerFailure({
          jobId: job.id,
          userId: job.user_id,
          errorCode: 'POST_INSERT_REVIEW_FAILED',
          error
        });
      }
    }

    await deps.cleanupTemporaryAudioAfterCompletion({
      jobId: job.id,
      userId: job.user_id,
      audioStorageKey: job.audio_storage_key,
      deleteAudio: deps.deleteTemporaryAudio,
      logFailure: deps.logWorkerFailure
    });

    logWorkerEvent('worker_job_completed', {
      jobId: job.id,
      userId: job.user_id,
      provider: completedAttempt.provider,
      transcriptionModel: completedAttempt.transcriptionModel,
      categorizationModel: completedAttempt.categorizationModel,
      retryCount: job.retry_count
    });

    return { status: 'completed' as const };
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
