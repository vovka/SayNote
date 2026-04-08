import type { CategorizationNoteSummary, UnifiedCategorizationRequest } from '../../../shared/types/provider';
import type { CategoryCatalogRow, ExistingNoteForReviewRow, ReviewCursorRow } from '../db';

const MAX_UNIFIED_REVIEW_NOTES = Number(process.env.WORKER_UNIFIED_REVIEW_NOTES_LIMIT ?? 300);

export interface BuildUnifiedInputResult {
  payload: UnifiedCategorizationRequest;
  reviewedNoteIds: Set<string>;
  nextCursorAfterNoteId: string | null;
  usedBatchedReview: boolean;
}

function toReviewNote(note: ExistingNoteForReviewRow): CategorizationNoteSummary {
  return {
    id: note.id,
    text: note.text,
    currentCategoryId: note.current_category_id,
    currentCategoryPath: note.current_category_path,
    isInLockedSubtree: note.is_in_locked_subtree
  };
}

export function buildUnifiedCategorizationInput(input: {
  newNoteText: string;
  newNoteCreatedAt: string;
  categories: CategoryCatalogRow[];
  existingNotes: ExistingNoteForReviewRow[];
  reviewCursor: ReviewCursorRow | null;
}): BuildUnifiedInputResult {
  const reviewedPool = [...input.existingNotes].sort((a, b) => a.id.localeCompare(b.id));
  const useBatching = reviewedPool.length > MAX_UNIFIED_REVIEW_NOTES;
  const cursor = input.reviewCursor?.cursor_after_note_id ?? null;

  const notesAfterCursor = cursor ? reviewedPool.filter((note) => note.id > cursor) : reviewedPool;
  const selectedBatch = (notesAfterCursor.length ? notesAfterCursor : reviewedPool).slice(0, MAX_UNIFIED_REVIEW_NOTES);
  const reviewedNotes = useBatching ? selectedBatch : reviewedPool;
  const nextCursorAfterNoteId = reviewedNotes.length ? reviewedNotes[reviewedNotes.length - 1].id : cursor;

  return {
    payload: {
      newNote: {
        text: input.newNoteText,
        createdAt: input.newNoteCreatedAt
      },
      existingCategories: input.categories.map((category) => ({
        id: category.id,
        path: category.path_cache,
        depth: category.path_cache.split('>').length,
        isLocked: category.is_locked,
        noteCount: category.note_count
      })),
      existingNotes: reviewedNotes.map(toReviewNote),
      rules: {
        reuseExistingCategoryWhenItFits: true,
        allDepthsAreEquallyValid: true,
        doNotPreferNestedCategories: true,
        doNotMoveLockedSubtrees: true,
        omitLowConfidenceRecategorizations: true
      }
    },
    reviewedNoteIds: new Set(reviewedNotes.map((note) => note.id)),
    nextCursorAfterNoteId,
    usedBatchedReview: useBatching
  };
}
