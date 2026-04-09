import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('notes page applies temporary highlight class to newly detected notes', async () => {
  const source = await readFile(new URL('../../app/notes/page.tsx', import.meta.url), 'utf8');

  assert.match(source, /className=\{isHighlighted \? 'note-item--new' : undefined\}/);
  assert.doesNotMatch(source, /style=\{isHighlighted \? \{ backgroundColor: '#fff7cc' \} : undefined\}/);
  assert.match(source, /setHighlightedNoteIds\(highlightTrackerRef\.current\.next\(sortedTrees\)\)/);
});

test('notes page defines dedicated note highlight animation styles', async () => {
  const source = await readFile(new URL('../../app/notes/page.tsx', import.meta.url), 'utf8');

  assert.match(source, /\.note-item--new\s*\{/);
  assert.match(source, /animation:\s*note-item-new-fade 1600ms ease-out, note-item-new-pulse 900ms ease-out 2;/);
  assert.match(source, /@keyframes note-item-new-fade/);
  assert.match(source, /@keyframes note-item-new-pulse/);
});

test('notes page includes reduced-motion fallback for new-note highlight', async () => {
  const source = await readFile(new URL('../../app/notes/page.tsx', import.meta.url), 'utf8');

  assert.match(source, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.note-item--new\s*\{[\s\S]*?animation:\s*none;/);
  assert.match(source, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.note-item--new\s*\{[\s\S]*?background:\s*#fff7cc;/);
  assert.match(source, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.note-item--new\s*\{[\s\S]*?box-shadow:\s*inset 0 0 0 2px #f59e0b;/);
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
  assert.doesNotMatch(source, /' · New'/);
  assert.doesNotMatch(source, /Note visible/);
  assert.doesNotMatch(source, /nextPath\.join\(' > '\)/);
  assert.match(source, /<small style=\{\{ color: '#6b7280' \}\}>/);
  assert.match(source, /<p style=\{\{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 \}\}>/);
});
