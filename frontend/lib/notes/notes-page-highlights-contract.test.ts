import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('notes page applies temporary highlight class to newly detected notes', async () => {
  const source = await readFile(new URL('../../app/notes/page.tsx', import.meta.url), 'utf8');

  assert.match(source, /className=\{isHighlighted \? 'note-item--new' : undefined\}/);
  assert.match(source, /setHighlightedNoteIds\(highlightTrackerRef\.current\.next\(sortedTrees\)\)/);
});

test('notes page clears highlight tracker when page session ends', async () => {
  const source = await readFile(new URL('../../app/notes/page.tsx', import.meta.url), 'utf8');

  assert.match(source, /highlightTrackerRef\.current\.reset\(\)/);
});

test('notes page refreshAll helper keeps highlighting and refresh wiring', async () => {
  const source = await readFile(new URL('../../app/notes/page.tsx', import.meta.url), 'utf8');

  assert.match(source, /const refreshAll = async \(\) => \{/);
  assert.match(source, /setHighlightedNoteIds\(highlightTrackerRef\.current\.next\(sortedTrees\)\)/);
  assert.match(source, /setInterval\(\(\) => \{\s*void refreshAll\(\);\s*\}, 15_000\);/s);
  assert.match(source, /window\.addEventListener\('focus', onRefresh\)/);
});

test('notes page note rows render stable metadata without lifecycle labels', async () => {
  const source = await readFile(new URL('../../app/notes/page.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /labelForLifecycleStage\(isFrontendLifecycleStage\(note\.lifecycleStage\)/);
  assert.doesNotMatch(source, /'note_visible'/);
  assert.doesNotMatch(source, /' · New'/);
  assert.doesNotMatch(source, /Note visible/);
});
