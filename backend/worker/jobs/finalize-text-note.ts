import type { PoolClient } from 'pg';
import {
  loadJobDependencies,
  loadCategoryCatalog,
  loadExistingNotesForReview,
  loadReviewCursor
} from '../db';
import { decryptSecret } from '../security/encryption';
import { getProvider } from '../providers/registry';
import { buildUnifiedCategorizationInput } from '../categories/build-unified-categorization-input';
import { finalizeCategorizedNote } from './finalize-categorized-note';
import { logWorkerEvent } from '../security/safe-logging';

export interface FinalizeTextNoteInput {
  userId: string;
  text: string;
  createdAt: string;
  durationMs: number;
  clientRecordingId: string;
  idempotencyKey: string;
  speechLanguage: string;
}

export async function finalizeTextNote(
  client: PoolClient,
  input: FinalizeTextNoteInput
): Promise<{ noteId: string; jobId: string }> {
  const { config, credentialsByProvider } = await loadJobDependencies(client, input.userId);

  const categorizationModel = config.categorization_model;
  const provider = config.primary_provider;
  const credential = credentialsByProvider.get(provider);
  if (!credential) {
    throw new Error(`AI credential missing for provider ${provider}`);
  }

  // Insert synthetic processing_jobs row (status=completed, no audio)
  const jobResult = await client.query<{ id: string }>(
    `insert into processing_jobs
       (user_id, client_recording_id, idempotency_key, status, audio_storage_key,
        audio_mime_type, audio_duration_ms, retry_count, provider_used,
        transcription_model, categorization_model, client_created_at, completed_at)
     values ($1, $2, $3, 'completed', null, 'text/azure-live', $4, 0, 'azure_live', 'azure-live', $5, $6::timestamptz, now())
     on conflict (user_id, idempotency_key) do nothing
     returning id`,
    [input.userId, input.clientRecordingId, input.idempotencyKey, input.durationMs, categorizationModel, input.createdAt]
  );

  let jobId: string;
  if (jobResult.rowCount && jobResult.rows[0]) {
    jobId = jobResult.rows[0].id;
  } else {
    // Idempotent replay — job row already exists
    const existingJob = await client.query<{ id: string }>(
      'select id from processing_jobs where user_id = $1 and idempotency_key = $2 limit 1',
      [input.userId, input.idempotencyKey]
    );
    jobId = existingJob.rows[0]!.id;

    // Check if note was already inserted for this job
    const existingNote = await client.query<{ id: string }>(
      'select id from notes where source_job_id = $1 limit 1',
      [jobId]
    );
    if (existingNote.rowCount && existingNote.rows[0]) {
      return { noteId: existingNote.rows[0].id, jobId };
    }
  }

  const reviewLimit = Number(process.env.WORKER_UNIFIED_REVIEW_NOTES_LIMIT ?? 300);
  const [categories, reviewCursor] = await Promise.all([
    loadCategoryCatalog(client, input.userId),
    loadReviewCursor(client, input.userId)
  ]);
  const reviewedNotes = await loadExistingNotesForReview(client, input.userId, {
    limit: reviewLimit * 2,
    cursorAfterNoteId: reviewCursor?.cursor_after_note_id ?? null
  });

  const unifiedInput = buildUnifiedCategorizationInput({
    newNoteText: input.text,
    newNoteCreatedAt: input.createdAt,
    categories,
    existingNotes: reviewedNotes,
    reviewCursor
  });

  const filteredReviewedNotes = reviewedNotes.filter((note) => unifiedInput.reviewedNoteIds.has(note.id));

  const apiKey = await decryptSecret(credential.encrypted_api_key);
  const adapter = getProvider(provider);
  const categorization = await adapter.categorizeWithReview({
    model: categorizationModel,
    apiKey,
    payload: unifiedInput.payload
  });

  // Build a ProcessingJobRow for finalizeCategorizedNote
  const syntheticJob = {
    id: jobId,
    user_id: input.userId,
    client_recording_id: input.clientRecordingId,
    client_created_at: input.createdAt,
    status: 'completed' as const,
    audio_storage_key: null,
    retry_count: 0,
    error_code: null,
    error_message_safe: null,
    provider_used: 'azure_live',
    transcription_model: 'azure-live',
    categorization_model: categorizationModel
  };

  const { noteId } = await finalizeCategorizedNote(client, {
    job: syntheticJob,
    transcriptionText: input.text,
    categorization,
    categories,
    reviewedNotes: filteredReviewedNotes,
    nextCursorAfterNoteId: unifiedInput.nextCursorAfterNoteId,
    completedAttempt: {
      provider,
      transcriptionModel: 'azure-live',
      categorizationModel,
      isPrimary: true
    },
    source: 'azure_live'
  });

  if (!noteId) {
    throw new Error('Note insert did not return an id');
  }

  logWorkerEvent('live_note_finalized', {
    jobId,
    userId: input.userId,
    provider,
    categorizationModel
  });

  return { noteId, jobId };
}
