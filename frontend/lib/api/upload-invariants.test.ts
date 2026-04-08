import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_UPLOAD_BYTES, createIdempotentUploadJob, validateUploadInvariants } from './upload-invariants.ts';

const SAMPLE_JOB = {
  id: 'job-1',
  status: 'uploaded' as const,
  clientRecordingId: 'rec-1',
  idempotencyKey: 'idem-1',
  audioStorageKey: 'audio/user-1/idempotency/a.webm',
  audioMimeType: 'audio/webm',
  audioDurationMs: 1000,
  clientCreatedAt: '2025-12-31T23:59:58.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
};

test('validateUploadInvariants rejects unsupported MIME types', () => {
  const result = validateUploadInvariants({ mimeType: 'image/png', sizeBytes: 1024 });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 415);
  }
});

test('validateUploadInvariants accepts codec-qualified audio and normalizes it', () => {
  const result = validateUploadInvariants({ mimeType: 'audio/webm;codecs=opus', sizeBytes: 1024 });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.normalizedMimeType, 'audio/webm');
  }
});

test('validateUploadInvariants rejects oversized uploads', () => {
  const result = validateUploadInvariants({ mimeType: 'audio/webm', sizeBytes: MAX_UPLOAD_BYTES + 1 });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 413);
  }
});

test('createIdempotentUploadJob returns existing job on duplicate', async () => {
  const duplicateError = { code: '23505' };
  const result = await createIdempotentUploadJob({
    insert: async () => {
      throw duplicateError;
    },
    loadExisting: async () => SAMPLE_JOB,
    isDuplicateError: (error) => error === duplicateError
  });

  assert.equal(result.id, SAMPLE_JOB.id);
  assert.equal(result.clientCreatedAt, SAMPLE_JOB.clientCreatedAt);
  assert.equal(result.wasDuplicate, true);
});

test('createIdempotentUploadJob returns created job for first upload', async () => {
  const result = await createIdempotentUploadJob({
    insert: async () => SAMPLE_JOB,
    loadExisting: async () => null,
    isDuplicateError: () => false
  });

  assert.equal(result.id, SAMPLE_JOB.id);
  assert.equal(result.wasDuplicate, false);
});
