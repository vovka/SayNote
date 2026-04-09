import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('notes page wires recording lifecycle polling and sync loop', async () => {
  const source = await readFile(new URL('../../app/notes/page.tsx', import.meta.url), 'utf8');

  assert.match(source, /const RECORDING_STATUS_POLL_INTERVAL_MS = 1_000;/);
  assert.match(source, /const stopSyncLoop = startSyncLoop\(\);/);
  assert.match(source, /db\.recordings\.where\(\{ userId \}\)\.orderBy\('createdAt'\)\.reverse\(\)\.first\(\)/);
  assert.match(source, /setInterval\(\(\) => void refreshLatestRecording\(\), RECORDING_STATUS_POLL_INTERVAL_MS\)/);
  assert.match(source, /setStatusHint\(labelForLifecycleStage\('recorded_local'\)\)/);
});

test('notes page keeps lifecycle status messaging for terminal and ready states', async () => {
  const source = await readFile(new URL('../../app/notes/page.tsx', import.meta.url), 'utf8');

  assert.match(source, /if \(stage === 'processed' \|\| stage === "note_visible"\) return 'Your note is ready'/);
  assert.match(source, /if \(stage === 'failed_upload_terminal'\) return `\$\{base\}\. Check your connection and record again\.\$\{reason\}`/);
  assert.match(source, /if \(stage === 'failed_processing_terminal'\) return `\$\{base\}\. Please record again in a moment\.\$\{reason\}`/);
  assert.match(source, /if \(stage\.startsWith\('failed_'\)\) return failureStatusMessage\(item, stage\)/);
});

test('notes page validates auth before recording and reports specific start errors', async () => {
  const source = await readFile(new URL('../../app/notes/page.tsx', import.meta.url), 'utf8');

  assert.match(source, /const onTapRecord = useCallback\(async \(\) => \{/);
  assert.match(source, /if \(!userId\) \{\s*setActionError\('Missing authenticated user\. Please sign in again\.'\);\s*return;\s*}/s);
  assert.match(source, /const message = error instanceof Error \? error\.message : 'Microphone access denied or unavailable';/);
});

test('home page renders the same notes-plus-recorder experience', async () => {
  const source = await readFile(new URL('../../app/page.tsx', import.meta.url), 'utf8');

  assert.match(source, /export \{ default \} from '\.\/notes\/page';/);
});
