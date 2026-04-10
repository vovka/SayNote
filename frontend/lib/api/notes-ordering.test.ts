import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('notes tree ordering uses note created_at (original recording timestamp) newest-first', async () => {
  const source = await readFile(new URL('./supabase-server.ts', import.meta.url), 'utf8');

  assert.match(source, /from\('notes'\)\s*\.select\('id,category_id,text,created_at,source_job_id,metadata'\)/s);
  assert.match(source, /\.order\('created_at', \{ ascending: false \}\)/);
  assert.match(source, /new Date\(b\.createdAt\)\.getTime\(\) - new Date\(a\.createdAt\)\.getTime\(\)/);
  assert.match(source, /loadClientRecordingIds/);
  assert.doesNotMatch(source, /processed_at/);
});
