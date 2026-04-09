import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('category APIs expose lock state and patch endpoint uses isLocked payload', async () => {
  const [categoriesRoute, categoryRoute, notesRoute, noteRoute] = await Promise.all([
    readFile(new URL('../../app/api/categories/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../app/api/categories/[id]/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../app/api/notes/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../app/api/notes/[id]/route.ts', import.meta.url), 'utf8')
  ]);

  assert.match(categoriesRoute, /isLocked/);
  assert.match(categoryRoute, /export async function PATCH/);
  assert.match(categoryRoute, /export async function DELETE/);
  assert.match(categoryRoute, /isLocked/);
  assert.match(categoryRoute, /name/);
  assert.match(notesRoute, /getNotesTreeForUser/);
  assert.match(noteRoute, /export async function PATCH/);
  assert.match(noteRoute, /export async function DELETE/);
  assert.match(noteRoute, /text/);
});

test('notes page renders accessible lock state control and toggles lock state via api client', async () => {
  const [notesPage, apiClient, supabaseServer] = await Promise.all([
    readFile(new URL('../../app/notes/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('./client.ts', import.meta.url), 'utf8'),
    readFile(new URL('./supabase-server.ts', import.meta.url), 'utf8')
  ]);

  assert.match(notesPage, /aria-label=\{node\.isLocked \? `Unlock category \$\{node\.name\}` : `Lock category \$\{node\.name\}`}/);
  assert.match(notesPage, /title=\{node\.isLocked \? `Locked category: \$\{node\.name\}` : `Unlocked category: \$\{node\.name\}`}/);
  assert.match(notesPage, /node\.isLocked \? '🔐' : '🔓'/);
  assert.match(notesPage, /backgroundColor: node\.isLocked \? '#1f2937' : '#ffffff'/);
  assert.match(notesPage, /outline: '2px solid transparent'/);
  assert.match(notesPage, /outlineColor: isLockControlFocused \? \(node\.isLocked \? '#93c5fd' : '#2563eb'\) : 'transparent'/);
  assert.match(notesPage, /updateCategoryLock\(/);
  assert.match(notesPage, /renameCategory\(/);
  assert.match(notesPage, /deleteCategory\(/);
  assert.match(notesPage, /updateNote\(/);
  assert.match(notesPage, /deleteNote\(/);
  assert.match(notesPage, /reconcileSyncItemsWithNotes/);
  assert.match(notesPage, /SYNC_JOB_COMPLETED_EVENT/);
  assert.match(apiClient, /export async function updateCategoryLock/);
  assert.match(apiClient, /export async function renameCategory/);
  assert.match(apiClient, /export async function deleteCategory/);
  assert.match(apiClient, /export async function updateNote/);
  assert.match(apiClient, /export async function deleteNote/);
  assert.match(apiClient, /clientRecordingId/);
  assert.match(supabaseServer, /is_locked/);
  assert.match(supabaseServer, /updateNoteForUser/);
  assert.match(supabaseServer, /deleteNoteForUser/);
  assert.match(supabaseServer, /renameCategoryForUser/);
  assert.match(supabaseServer, /deleteCategoryForUser/);
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
