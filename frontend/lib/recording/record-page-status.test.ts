import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('record page derives lifecycle status from latest recording updates', async () => {
  const source = await readFile(new URL('../../app/page.tsx', import.meta.url), 'utf8');

  assert.match(source, /const RECORDING_STATUS_POLL_INTERVAL_MS = 1_000;/);
  assert.match(source, /db\.recordings\.where\('userId'\)\.equals\(userId\)\.toArray\(\)/);
  assert.match(source, /return isFrontendLifecycleStage\(stage\) \? stage : lifecycleStageFromRecording\(item\)/);
  assert.match(source, /setInterval\(\(\) => void refreshLatestRecording\(\), RECORDING_STATUS_POLL_INTERVAL_MS\)/);
});

test('record page surfaces transition sequence and terminal states', async () => {
  const source = await readFile(new URL('../../app/page.tsx', import.meta.url), 'utf8');

  assert.match(source, /setStatusHint\(labelForLifecycleStage\('recorded_local'\)\)/);
  assert.match(source, /if \(stage === 'processed' \|\| stage === 'note_visible'\) return 'Your note is ready'/);
  assert.match(source, /if \(stage === 'failed_upload_terminal'\) return `\$\{base\}\. Check your connection and record again\.\$\{reason\}`/);
  assert.match(source, /if \(stage === 'failed_processing_terminal'\) return `\$\{base\}\. Please record again in a moment\.\$\{reason\}`/);
  assert.match(source, /if \(stage.startsWith\('failed_'\)\) return failureStatusMessage\(item, stage\)/);
});
