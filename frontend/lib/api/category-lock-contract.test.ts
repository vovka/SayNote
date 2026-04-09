import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('category APIs expose lock state and patch endpoint uses isLocked payload', async () => {
  const [categoriesRoute, categoryPatchRoute, notesRoute] = await Promise.all([
    readFile(new URL('../../app/api/categories/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../app/api/categories/[id]/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../app/api/notes/route.ts', import.meta.url), 'utf8')
  ]);

  assert.match(categoriesRoute, /isLocked/);
  assert.match(categoryPatchRoute, /export async function PATCH/);
  assert.match(categoryPatchRoute, /isLocked/);
  assert.match(notesRoute, /getNotesTreeForUser/);
});

test('notes page renders lock icon and toggles lock state via api client', async () => {
  const [notesPage, apiClient, supabaseServer] = await Promise.all([
    readFile(new URL('../../app/notes/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('./client.ts', import.meta.url), 'utf8'),
    readFile(new URL('./supabase-server.ts', import.meta.url), 'utf8')
  ]);

  assert.match(notesPage, /🔒/);
  assert.match(notesPage, /🔓/);
  assert.match(notesPage, /updateCategoryLock\(/);
  assert.match(notesPage, /reconcileSyncItemsWithNotes/);
  assert.match(notesPage, /SYNC_JOB_COMPLETED_EVENT/);
  assert.match(apiClient, /export async function updateCategoryLock/);
  assert.match(apiClient, /clientRecordingId/);
  assert.match(supabaseServer, /is_locked/);
  assert.match(supabaseServer, /path_cache/);
});

test('notes page batches refresh state updates after optional note refetch', async () => {
  const notesPage = await readFile(new URL('../../app/notes/page.tsx', import.meta.url), 'utf8');
  assert.match(notesPage, /let nextTrees = await getNotes\(\)/);
  assert.match(notesPage, /if \(hadNewProcessedItem\) {\s*nextTrees = await getNotes\(\);\s*}/s);
  assert.match(notesPage, /const sortedTrees = sortCategoryTreeNewestFirst\(nextTrees\)/);
  assert.match(notesPage, /setTrees\(sortedTrees\)/);
  assert.match(notesPage, /setSyncItems\(reconcileSyncItemsWithNotes\(buildSyncStatusItems\(items\), flattenNotes\(sortedTrees\)\)\)/);
});
