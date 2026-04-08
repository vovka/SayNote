import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('upload route starts processing workflow after creating the job', async () => {
  const source = await readFile(new URL('./audio/upload/route.ts', import.meta.url), 'utf8');
  assert.match(source, /await startProcessingJobWorkflow\(job\.id,\s*job\.status\)/);
});

test('job lookup route re-enqueues uploaded or retryable jobs', async () => {
  const source = await readFile(new URL('./jobs/[id]/route.ts', import.meta.url), 'utf8');
  assert.match(source, /await startProcessingJobWorkflow\(job\.id,\s*job\.status\)/);
});

