import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('notes page wires recording lifecycle polling and sync loop', async () => {
  const source = await readFile(new URL('../../app/notes/page.tsx', import.meta.url), 'utf8');

  assert.match(source, /const RECORDING_STATUS_POLL_INTERVAL_MS = 1_000;/);
  assert.match(source, /const stopSyncLoop = startSyncLoop\(\);/);
  assert.match(source, /db\.recordings\.where\('userId'\)\.equals\(userId\)\.toArray\(\)/);
  assert.match(source, /setInterval\(\(\) => void refreshLatestRecording\(\), RECORDING_STATUS_POLL_INTERVAL_MS\)/);
  assert.match(source, /setStatusHint\(labelForLifecycleStage\('recorded_local'\)\)/);
});

test('home page points users to recorder in notes view', async () => {
  const source = await readFile(new URL('../../app/page.tsx', import.meta.url), 'utf8');

  assert.match(source, /href="\/notes"/);
  assert.match(source, /Recorder moved to Notes/);
});
