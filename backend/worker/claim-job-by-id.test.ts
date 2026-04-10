import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('claimJobById only claims uploaded and failed_retryable jobs', async () => {
  const source = await readFile(new URL('./claim-job-by-id.ts', import.meta.url), 'utf8');
  assert.match(source, /status in \('uploaded', 'failed_retryable'\)/);
  assert.match(source, /set status = 'processing'/);
});
