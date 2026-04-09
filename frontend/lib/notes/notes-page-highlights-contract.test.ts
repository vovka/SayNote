import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('notes page applies temporary highlight class to newly detected notes', async () => {
  const source = await readFile(new URL('../../app/notes/page.tsx', import.meta.url), 'utf8');

  assert.match(source, /className=\{isHighlighted \? 'note-item--new' : undefined\}/);
  assert.match(source, /setHighlightedNoteIds\(highlightTrackerRef\.current\.next\(nextTrees\)\)/);
});

test('notes page clears highlight tracker when page session ends', async () => {
  const source = await readFile(new URL('../../app/notes/page.tsx', import.meta.url), 'utf8');

  assert.match(source, /highlightTrackerRef\.current\.reset\(\)/);
});
