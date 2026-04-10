import assert from 'node:assert/strict';
import test from 'node:test';
import { runProcessUploadJob } from './process-upload-job-orchestrator';

const claimedJob = {
  id: 'job-1',
  user_id: 'user-1',
  status: 'uploaded' as const,
  client_created_at: '2026-04-08T10:00:00.000Z',
  audio_storage_key: 'audio/key',
  retry_count: 0,
  error_code: null,
  error_message_safe: null,
  provider_used: null,
  transcription_model: null,
  categorization_model: null
};

test('runProcessUploadJob waits and retries failed_retryable jobs', async () => {
  let claimed = 0;
  let waited = 0;
  const statuses = ['failed_retryable', 'completed'] as const;
  const result = await runProcessUploadJob('job-1', {
    claimJobById: async () => (claimed += 1, claimedJob),
    processClaimedJob: async () => ({ status: statuses[claimed - 1] }),
    waitForRetry: async () => { waited += 1; }
  });
  assert.equal(result.status, 'completed');
  assert.equal(claimed, 2);
  assert.equal(waited, 1);
});

test('runProcessUploadJob skips when the job is not claimable', async () => {
  const result = await runProcessUploadJob('job-2', {
    claimJobById: async () => null,
    processClaimedJob: async () => ({ status: 'completed' as const }),
    waitForRetry: async () => undefined
  });
  assert.equal(result.status, 'skipped');
});
