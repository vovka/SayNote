import type { PoolClient } from 'pg';
import type { CategorizeWithReviewResult } from '../../../shared/types/provider';
import {
  applyRecategorization,
  saveReviewCursor,
  type CategoryCatalogRow,
  type ExistingNoteForReviewRow,
  type ProcessingJobRow
} from '../db';
import { resolveCategorySelection } from '../categories/resolve-category-path';
import { buildLockedSubtreeSet } from '../categories/locked-subtree';
import { logWorkerFailure } from '../security/safe-logging';
import type { ProcessingAttempt } from './attempt-policy';

export type { ProcessingAttempt };

export interface FinalizeCategorizedNoteDependencies {
  resolveCategorySelection: typeof resolveCategorySelection;
  applyRecategorization: typeof applyRecategorization;
  saveReviewCursor: typeof saveReviewCursor;
  logWorkerFailure: typeof logWorkerFailure;
}

const defaultDeps: FinalizeCategorizedNoteDependencies = {
  resolveCategorySelection,
  applyRecategorization,
  saveReviewCursor,
  logWorkerFailure
};

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
  deps: FinalizeCategorizedNoteDependencies;
}) {
  const lockedSet = buildLockedSubtreeSet(
    input.categories.map((category) => ({
      id: category.id,
      parent_id: category.parent_id,
      is_locked: category.is_locked
    }))
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
      input.deps.logWorkerFailure({
        jobId: input.job.id,
        userId: input.job.user_id,
        errorCode: 'AUTO_RECATEGORIZATION_FAILED',
        error
      });
    }
  }
}

export async function finalizeCategorizedNote(
  client: PoolClient,
  input: {
    job: ProcessingJobRow;
    transcriptionText: string;
    categorization: CategorizeWithReviewResult;
    categories: CategoryCatalogRow[];
    reviewedNotes: ExistingNoteForReviewRow[];
    nextCursorAfterNoteId: string | null;
    completedAttempt: ProcessingAttempt;
    source: 'batch' | 'azure_live';
    deps?: FinalizeCategorizedNoteDependencies;
  }
): Promise<{ noteId: string | null; insertedNewNote: boolean }> {
  const deps = input.deps ?? defaultDeps;
  let insertedNewNote = false;
  let noteId: string | null = null;

  await client.query('begin');
  try {
    const existingNote = await client.query<{ id: string }>(
      'select id from notes where source_job_id = $1 limit 1',
      [input.job.id]
    );

    if (!existingNote.rowCount) {
      const categoryId = await deps.resolveCategorySelection(client, {
        userId: input.job.user_id,
        selectedCategoryId: input.categorization.newNoteAssignment.selectedCategoryId,
        newCategoryPath: input.categorization.newNoteAssignment.newCategoryPath
      });

      const inserted = await client.query<{ id: string }>(
        `insert into notes (user_id, category_id, source_job_id, text, created_at, processed_at, updated_at, metadata)
         values ($1, $2, $3, $4, $5::timestamptz, now(), now(), $6::jsonb)
         returning id`,
        [
          input.job.user_id,
          categoryId,
          input.job.id,
          input.transcriptionText,
          input.job.client_created_at,
          JSON.stringify({
            provider: input.completedAttempt.provider,
            assignmentMode: 'initial',
            sourceJobId: input.job.id,
            clientRecordingId: input.job.client_recording_id,
            assignedCategoryPath: input.categorization.newNoteAssignment.newCategoryPath ?? null,
            assignmentConfidence: input.categorization.newNoteAssignment.confidence ?? null,
            assignmentReason: input.categorization.newNoteAssignment.reason ?? null,
            transcriptionSource: input.source
          })
        ]
      );
      noteId = inserted.rows[0]?.id ?? null;
      insertedNewNote = true;
    } else {
      noteId = existingNote.rows[0]?.id ?? null;
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
      [
        input.job.id,
        input.completedAttempt.provider,
        input.completedAttempt.transcriptionModel,
        input.completedAttempt.categorizationModel
      ]
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
        job: input.job,
        categories: input.categories,
        reviewedNotes: input.reviewedNotes,
        result: input.categorization,
        deps
      });

      if (input.nextCursorAfterNoteId !== null) {
        await deps.saveReviewCursor(client, input.job.user_id, input.nextCursorAfterNoteId);
      }

      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      deps.logWorkerFailure({
        jobId: input.job.id,
        userId: input.job.user_id,
        errorCode: 'POST_INSERT_REVIEW_FAILED',
        error
      });
    }
  }

  return { noteId, insertedNewNote };
}
