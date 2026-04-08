import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('process upload workflow does not pass function dependencies into durable state', async () => {
  const source = await readFile(new URL('../../workflows/process-upload-job.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /waitForRetry:/);
  assert.doesNotMatch(source, /runProcessUploadJob\(jobId,\s*\{/);
  assert.match(source, /while \(true\)/);
  assert.match(source, /await sleep\(retryDelayMs\)/);
});

test('frontend workspace declares backend runtime packages used by workflow steps', async () => {
  const source = await readFile(new URL('../../package.json', import.meta.url), 'utf8');
  assert.match(source, /"pg"\s*:/);
  assert.match(source, /"@types\/pg"\s*:/);
});
