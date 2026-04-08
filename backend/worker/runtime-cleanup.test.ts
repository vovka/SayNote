import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('backend package no longer exposes a standalone worker script', async () => {
  const source = await readFile(new URL('../package.json', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /"worker"\s*:/);
});

test('docker compose no longer defines a worker service', async () => {
  const source = await readFile(new URL('../../docker-compose.yml', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /^  worker:/m);
});

test('workflow retry delay uses processing-specific env naming', async () => {
  const source = await readFile(new URL('../../frontend/workflows/process-upload-job.ts', import.meta.url), 'utf8');
  assert.match(source, /PROCESSING_RETRY_DELAY_MS/);
  assert.doesNotMatch(source, /WORKER_POLL_INTERVAL_MS/);
});
