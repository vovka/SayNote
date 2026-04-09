import test from 'node:test';
import assert from 'node:assert/strict';
import type { RecordingEntity } from '@/lib/db/indexeddb';
import {
  buildSyncStatusItems,
  getSyncStageVisual,
  reconcileSyncItemsWithNotes
} from './sync-visibility.ts';

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
  assert.deepEqual(items.map((item) => item.label), ['Uploading', 'Queued for upload', 'Recorded locally']);
});

test('buildSyncStatusItems includes uploaded waiting processing', () => {
  const items = buildSyncStatusItems([
    makeRecording({ id: 'waiting', status: 'uploaded_waiting_processing' })
  ]);

  assert.equal(items[0]?.label, 'Transcribing');
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

  assert.equal(items[0]?.label, 'Transcription failed permanently');
});

test('buildSyncStatusItems maps upload failure labels with canonical terminology', () => {
  const items = buildSyncStatusItems([
    makeRecording({ id: 'retry', status: 'failed_retryable', failedStage: 'upload', uploadRetryCount: 3 }),
    makeRecording({ id: 'terminal', status: 'failed_terminal', failedStage: 'upload' })
  ]);

  assert.equal(items.find((item) => item.id === 'retry')?.label, 'Upload failed (retry 3)');
  assert.equal(items.find((item) => item.id === 'terminal')?.label, 'Upload failed permanently');
});

test('reconcileSyncItemsWithNotes hides pending processing once note exists', () => {
  const syncItems = buildSyncStatusItems([
    makeRecording({ id: 'rec-hide', status: 'uploaded_waiting_processing', serverJobId: 'job-hide' }),
    makeRecording({ id: 'rec-keep', status: 'uploaded_waiting_processing', serverJobId: 'job-keep' }),
    makeRecording({ id: 'rec-uploading', status: 'uploading' })
  ]);

  const visibleItems = reconcileSyncItemsWithNotes(syncItems, [{
    sourceJobId: 'job-hide',
    clientRecordingId: 'rec-hide'
  }]);

  assert.deepEqual(visibleItems.map((item) => item.id), ['rec-uploading', 'rec-keep']);
});

test('getSyncStageVisual marks uploading and transcribing stages as busy progress', () => {
  const uploading = getSyncStageVisual(makeRecording({ status: 'uploading' }));
  const transcribing = getSyncStageVisual(makeRecording({ status: 'uploaded_waiting_processing' }));

  assert.equal(uploading.showSpinner, true);
  assert.equal(uploading.isBusy, true);
  assert.equal(transcribing.showSpinner, true);
  assert.equal(transcribing.isBusy, true);
});

test('getSyncStageVisual marks retryable failures as retrying progress', () => {
  const retrying = getSyncStageVisual(
    makeRecording({ status: 'failed_retryable', failedStage: 'processing', processingRetryCount: 1 })
  );

  assert.equal(retrying.showSpinner, true);
  assert.equal(retrying.isBusy, true);
  assert.equal(retrying.liveText, 'Transcription failed (retry 1). Retrying.');
});
