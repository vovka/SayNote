import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('record page includes contract for idle, silent, and speaking animation states', async () => {
  const pageSource = await readFile(new URL('./page.tsx', import.meta.url), 'utf8');

  assert.match(pageSource, /type RecordingVisualState = 'idle' \| 'recording-silent' \| 'recording-speaking';/);
  assert.match(pageSource, /const SPEAKING_LEVEL_THRESHOLD = 0\.08;/);
  assert.match(pageSource, /const visualState = recording\s*\? level > SPEAKING_LEVEL_THRESHOLD\s*\? 'recording-speaking'\s*:\s*'recording-silent'\s*:\s*'idle';/);
  assert.match(pageSource, /const unsubscribe = subscribeToRecordingLevel\(\(nextLevel\) => \{/);
  assert.match(pageSource, /requestAnimationFrame\(/);
});
