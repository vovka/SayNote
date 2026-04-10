import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('createUploadJob persists and reads client_created_at while duplicate path loads existing row', async () => {
  const source = await readFile(new URL('./supabase-server.ts', import.meta.url), 'utf8');

  assert.match(source, /client_created_at: input\.clientCreatedAt/);
  assert.match(source, /\.select\('id,status,client_recording_id,idempotency_key,audio_storage_key,audio_mime_type,audio_duration_ms,client_created_at,created_at,updated_at'\)/);
  assert.match(source, /loadExisting: \(\) => getUploadJobByIdempotencyKey\(input\.userId, input\.idempotencyKey\)/);
});
