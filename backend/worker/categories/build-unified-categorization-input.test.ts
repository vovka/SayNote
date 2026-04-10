import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUnifiedCategorizationInput } from './build-unified-categorization-input.ts';

test('unified input includes full category catalog and deterministic note batch', () => {
  const result = buildUnifiedCategorizationInput({
    newNoteText: 'repair the kettle',
    newNoteCreatedAt: '2026-04-08T00:00:00Z',
    categories: [
      {
        id: 'cat-root',
        name: 'Kitchen',
        parent_id: null,
        path_cache: 'Kitchen',
        normalized_path_cache: 'kitchen',
        is_locked: false,
        note_count: 2
      },
      {
        id: 'cat-nested',
        name: 'Kitchen Appliances',
        parent_id: 'cat-root',
        path_cache: 'Home > Kitchen Appliances',
        normalized_path_cache: 'home > kitchen appliances',
        is_locked: false,
        note_count: 1
      }
    ],
    existingNotes: [
      {
        id: 'note-2',
        text: 'Buy toaster',
        current_category_id: 'cat-nested',
        current_category_path: 'Home > Kitchen Appliances',
        is_in_locked_subtree: false
      },
      {
        id: 'note-1',
        text: 'Buy chair',
        current_category_id: 'cat-root',
        current_category_path: 'Kitchen',
        is_in_locked_subtree: false
      }
    ],
    reviewCursor: null
  });

  assert.equal(result.payload.existingCategories.length, 2);
  assert.equal(result.payload.existingNotes[0]?.id, 'note-1');
  assert.equal(result.payload.rules.allDepthsAreEquallyValid, true);
  assert.equal(result.payload.rules.doNotPreferNestedCategories, true);
});
