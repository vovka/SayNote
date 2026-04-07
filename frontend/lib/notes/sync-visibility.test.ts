import test from 'node:test';
import assert from 'node:assert/strict';
import type { RecordingEntity } from '@/lib/db/indexeddb';
import { buildSyncStatusItems } from './sync-visibility.ts';

function makeRecording(overrides: Partial<RecordingEntity>): RecordingEntity {
  return {
    id: 'rec-default',
    userId: 'user-1',
    mimeType: 'audio/webm',
    durationMs: 1000,
    createdAt: '2026-04-07T12:00:00.000Z',
    status: 'queued_upload',
    uploadRetryCount: 0,
    processingRetryCount: 0,
    uploadIdempotencyKey: 'idem-1',
    statusUpdatedAt: '2026-04-07T12:00:00.000Z',
    ...overrides
  };
}

test('buildSyncStatusItems includes pending upload states and excludes processed', () => {
  const items = buildSyncStatusItems([
    makeRecording({ id: 'local', status: 'recorded_local' }),
    makeRecording({ id: 'queued', status: 'queued_upload' }),
    makeRecording({ id: 'uploading', status: 'uploading' }),
    makeRecording({ id: 'done', status: 'processed' })
  ]);

  assert.deepEqual(items.map((item) => item.id), ['uploading', 'queued', 'local']);
  assert.deepEqual(items.map((item) => item.label), ['Uploading', 'Pending upload', 'Pending upload']);
});

test('buildSyncStatusItems includes uploaded waiting processing', () => {
  const items = buildSyncStatusItems([
    makeRecording({ id: 'waiting', status: 'uploaded_waiting_processing' })
  ]);

  assert.equal(items[0]?.label, 'Pending processing');
});

test('buildSyncStatusItems includes retryable failure', () => {
  const items = buildSyncStatusItems([
    makeRecording({ id: 'retry', status: 'failed_retryable', failedStage: 'upload', uploadRetryCount: 2 })
  ]);

  assert.equal(items[0]?.label, 'Upload failed (retry 2)');
});

test('buildSyncStatusItems includes terminal failure', () => {
  const items = buildSyncStatusItems([
    makeRecording({ id: 'terminal', status: 'failed_terminal', failedStage: 'processing' })
  ]);

  assert.equal(items[0]?.label, 'Processing failed permanently');
});
