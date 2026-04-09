import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('ProcessingJobRow includes client_recording_id for note correlation metadata', async () => {
  const source = await readFile(new URL('./db.ts', import.meta.url), 'utf8');
  assert.match(source, /interface ProcessingJobRow[\s\S]*client_recording_id: string;/);
});
