import test from 'node:test';
import assert from 'node:assert/strict';
import type { PoolClient } from 'pg';
import { processJob } from './process-job.ts';
import type { ProcessingJobRow } from '../db.ts';

const baseJob: ProcessingJobRow = {
  id: 'j1', user_id: 'u1', status: 'processing', client_recording_id: 'r1',
  client_created_at: '2024-01-15T10:00:00Z', audio_storage_key: 'a.webm',
  retry_count: 0, error_code: null, error_message_safe: null,
  provider_used: null, transcription_model: null, categorization_model: null
};

function makeClient() {
  const queries: { sql: string; params: unknown[] }[] = [];
  const client = {
    async query(sql: string, params: unknown[] = []) {
      queries.push({ sql, params });
      return { rowCount: 0, rows: [] };
    }
  } as unknown as PoolClient;
  return { client, queries };
}

const defaultResult = {
  newNoteAssignment: { newCategoryPath: 'Work', confidence: 0.9, reason: 'test' },
  recategorizations: [],
  raw: {}
};

const baseDeps = {
  getTemporaryAudio: async () => ({ buffer: Buffer.alloc(1), contentType: 'audio/webm' as string }),
  deleteTemporaryAudio: async (k: string) => ({ storageKey: k, deleted: true as const }),
  loadJobDependencies: async () => ({
    config: {
      user_id: 'u1', primary_provider: 'groq',
      transcription_model: 'whisper-large-v3',
      categorization_model: 'llama-3.3-70b-versatile',
      fallback_provider: null, fallback_transcription_model: null,
      fallback_categorization_model: null, fallback_on_terminal_primary_failure: false
    },
    credentialsByProvider: new Map([['groq', { user_id: 'u1', provider: 'groq', encrypted_api_key: 'enc' }]])
  }),
  decryptSecret: async () => 'key',
  getProvider: () => ({
    transcribe: async () => ({ text: 'hello', raw: {} }),
    categorizeWithReview: async () => defaultResult
  }),
  resolveCategorySelection: async () => 'cat-1',
  markJobFailed: async () => {},
  logWorkerFailure: () => {},
  cleanupTemporaryAudioAfterCompletion: async () => {},
  loadCategoryCatalog: async () => [],
  loadExistingNotesForReview: async () => [],
  loadReviewCursor: async () => null,
  saveReviewCursor: async () => {},
  applyRecategorization: async () => {}
};

test('processJob returns completed on success', async () => {
  const { client } = makeClient();
  assert.equal((await processJob(client, baseJob, baseDeps)).status, 'completed');
});

test('note insert uses client_created_at for created_at and now() for processed_at', async () => {
  const { client, queries } = makeClient();
  await processJob(client, baseJob, baseDeps);
  const insert = queries.find((q) => q.sql.includes('insert into notes'));
  assert.ok(insert, 'expected note insert query to be executed');
  assert.equal(insert.params[4], baseJob.client_created_at);
  assert.match(insert.sql, /\$5::timestamptz, now\(\)/);
});

test('processJob returns failure when audio_storage_key is missing', async () => {
  const { client } = makeClient();
  const result = await processJob(client, { ...baseJob, audio_storage_key: null }, baseDeps);
  assert.ok(result.status.startsWith('failed_'));
});

test('post-insert recategorization failure does not prevent job completion', async () => {
  const { client } = makeClient();
  const result = await processJob(client, baseJob, {
    ...baseDeps,
    loadExistingNotesForReview: async () => [
      { id: 'n1', text: 'old note', current_category_id: 'c2', current_category_path: 'Other', is_in_locked_subtree: false }
    ],
    getProvider: () => ({
      transcribe: async () => ({ text: 'hello', raw: {} }),
      categorizeWithReview: async () => ({
        ...defaultResult,
        recategorizations: [{ noteId: 'n1', newCategoryPath: 'Work' }]
      })
    }),
    applyRecategorization: async () => { throw new Error('DB error'); }
  });
  assert.equal(result.status, 'completed');
});
