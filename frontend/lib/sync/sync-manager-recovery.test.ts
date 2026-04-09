import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('sync manager recovers stale uploading items and requeues uploads', async () => {
  const source = await readFile(new URL('./sync-manager.ts', import.meta.url), 'utf8');

  assert.match(source, /db\.recordings\s+\.where\('userId'\)\s+\.equals\(userId\)\s+\.and\(\(item\) => item\.status === 'uploading'\)\s+\.toArray\(\)/);
  assert.match(source, /pickStaleUploadRecoveryQueue\(uploadRecoveryCandidates, nowIso, UPLOADING_STALE_MS\)/);
  assert.match(source, /await db\.recordings\.update\(item\.id, \{\s*status: 'queued_upload',[\s\S]*statusUpdatedAt: nowIso,[\s\S]*\}\);/);
  assert.match(source, /lifecycleStage: 'queued_upload'/);
});

test('sync manager upload replay path is idempotent under ambiguous upload outcomes', async () => {
  const source = await readFile(new URL('./sync-manager.ts', import.meta.url), 'utf8');

  assert.match(source, /form\.append\('idempotencyKey', item\.uploadIdempotencyKey\)/);
  assert.match(source, /const result = await uploadAudio\(form\);/);
  assert.match(source, /status: 'uploaded_waiting_processing'/);
  assert.match(source, /lifecycleStage: 'transcribing'/);
  assert.match(source, /serverJobId: result\.job_id/);
  assert.match(source, /audioBlob: undefined/);
});

test('sync manager scopes queues and cleanup to the authenticated user', async () => {
  const source = await readFile(new URL('./sync-manager.ts', import.meta.url), 'utf8');

  assert.match(source, /const userId = await getCurrentUserId\(\);/);
  assert.match(source, /if \(!userId\) return;/);
  assert.match(source, /await recoverStaleSyncState\(userId\);/);
  assert.match(source, /await cleanupSyncedRecords\(userId\);/);
  assert.match(source, /modify\(\{ audioBlob: undefined \}\)/);
  assert.match(source, /item\.status === 'failed_terminal' && item\.statusUpdatedAt < terminalFailureBefore/);
});
