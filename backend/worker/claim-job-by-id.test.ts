import test from 'node:test';
import assert from 'node:assert/strict';
import type { PoolClient } from 'pg';
import { claimJobById } from './claim-job-by-id.ts';
import type { ProcessingJobRow } from './db.ts';

const baseRow: ProcessingJobRow = {
  id: 'j1', user_id: 'u1', status: 'processing', client_recording_id: 'r1',
  client_created_at: '2024-01-01T00:00:00Z', audio_storage_key: 'a.webm',
  retry_count: 0, error_code: null, error_message_safe: null,
  provider_used: null, transcription_model: null, categorization_model: null
};

function makeClient(rows: ProcessingJobRow[] = []) {
  const queries: { sql: string; params: unknown[] }[] = [];
  const client = {
    async query(sql: string, params: unknown[] = []) {
      queries.push({ sql, params });
      if (sql.includes('update processing_jobs')) {
        return { rows };
      }
      return { rows: [] };
    }
  } as unknown as PoolClient;
  return { client, queries };
}

test('claimJobById returns the updated row when a claimable job exists', async () => {
  const { client } = makeClient([baseRow]);
  const result = await claimJobById(client, 'j1');
  assert.deepEqual(result, baseRow);
});

test('claimJobById returns null when no row matches (job not claimable)', async () => {
  const { client } = makeClient([]);
  const result = await claimJobById(client, 'j1');
  assert.equal(result, null);
});

test('claimJobById issues begin and commit around the update', async () => {
  const { client, queries } = makeClient([baseRow]);
  await claimJobById(client, 'j1');
  assert.equal(queries[0]?.sql, 'begin');
  assert.equal(queries[2]?.sql, 'commit');
});

test('claimJobById rolls back and rethrows on query error', async () => {
  const queries: string[] = [];
  const errorClient = {
    async query(sql: string) {
      queries.push(sql);
      if (sql.includes('update')) throw new Error('DB failure');
      return { rows: [] };
    }
  } as unknown as PoolClient;
  await assert.rejects(() => claimJobById(errorClient, 'j1'), /DB failure/);
  assert.ok(queries.includes('rollback'));
});
