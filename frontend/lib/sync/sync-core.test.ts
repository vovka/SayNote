import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pickProcessingQueue,
  pickStaleProcessingRecoveryQueue,
  pickStaleUploadRecoveryQueue,
  pickUploadQueue
} from './sync-core.ts';
import { FRONTEND_LIFECYCLE_ORDER } from '@/lib/lifecycle/frontend-lifecycle';

test('pickUploadQueue supports offline->reconnect upload convergence selection', () => {
  const now = '2026-04-07T12:00:00.000Z';
  const result = pickUploadQueue(
    [
      { id: 'queued', status: 'queued_upload' },
      { id: 'retry-ready', status: 'failed_retryable', failedStage: 'upload', nextUploadRetryAt: '2026-04-07T11:59:00.000Z' },
      { id: 'retry-later', status: 'failed_retryable', failedStage: 'upload', nextUploadRetryAt: '2026-04-07T12:30:00.000Z' },
      { id: 'wrong-stage', status: 'failed_retryable', failedStage: 'processing' }
    ],
    now
  );

  assert.deepEqual(result.map((item) => item.id), ['queued', 'retry-ready']);
});

test('pickProcessingQueue selects pollable items after reconnect', () => {
  const now = '2026-04-07T12:00:00.000Z';
  const result = pickProcessingQueue(
    [
      { id: 'uploaded-ready', status: 'uploaded_waiting_processing', serverJobId: 'job-1', nextProcessingRetryAt: '2026-04-07T11:59:00.000Z' },
      { id: 'uploaded-no-job', status: 'uploaded_waiting_processing' },
      { id: 'processing-retry', status: 'failed_retryable', failedStage: 'processing', serverJobId: 'job-2', nextProcessingRetryAt: '2026-04-07T11:59:30.000Z' },
      { id: 'processing-later', status: 'failed_retryable', failedStage: 'processing', serverJobId: 'job-3', nextProcessingRetryAt: '2026-04-07T12:59:30.000Z' }
    ],
    now
  );

  assert.deepEqual(result.map((item) => item.id), ['uploaded-ready', 'processing-retry']);
});

test('recovery: crash before upload response resets stale uploading back to queued_upload', () => {
  const now = '2026-04-07T12:00:00.000Z';
  const stale = pickStaleUploadRecoveryQueue(
    [
      { id: 'stale-uploading', status: 'uploading', statusUpdatedAt: '2026-04-07T11:55:00.000Z' },
      { id: 'fresh-uploading', status: 'uploading', statusUpdatedAt: '2026-04-07T11:59:30.000Z' }
    ],
    now,
    120_000
  );

  assert.deepEqual(stale.map((item) => item.id), ['stale-uploading']);
});

test('recovery: crash after server accepted upload re-schedules stale processing poll with serverJobId preserved', () => {
  const now = '2026-04-07T12:00:00.000Z';
  const stale = pickStaleProcessingRecoveryQueue(
    [
      { id: 'waiting-stale', status: 'uploaded_waiting_processing', serverJobId: 'job-1', statusUpdatedAt: '2026-04-07T11:50:00.000Z' },
      { id: 'processing-retry-stale', status: 'failed_retryable', failedStage: 'processing', serverJobId: 'job-2', statusUpdatedAt: '2026-04-07T11:55:00.000Z' },
      { id: 'no-job', status: 'uploaded_waiting_processing', statusUpdatedAt: '2026-04-07T11:50:00.000Z' }
    ],
    now,
    120_000
  );

  assert.deepEqual(stale.map((item) => item.id), ['waiting-stale', 'processing-retry-stale']);
  assert.deepEqual(stale.map((item) => item.serverJobId), ['job-1', 'job-2']);
});

test('restart with stale uploading feeds upload queue once recovered', () => {
  const now = '2026-04-07T12:00:00.000Z';
  const recoverable = pickStaleUploadRecoveryQueue(
    [{ id: 'recording-1', status: 'uploading', statusUpdatedAt: '2026-04-07T11:50:00.000Z' }],
    now,
    120_000
  );
  const uploadQueue = pickUploadQueue(
    recoverable.map((item) => ({ ...item, status: 'queued_upload' as const })),
    now
  );

  assert.deepEqual(uploadQueue.map((item) => item.id), ['recording-1']);
});

test('duplicate sync triggers after restart do not duplicate recovered queue selection', () => {
  const now = '2026-04-07T12:00:00.000Z';
  const recovered = [{ id: 'dedupe-1', status: 'queued_upload' as const }];
  const firstPick = pickUploadQueue(recovered, now).map((item) => item.id);
  const secondPick = pickUploadQueue(recovered, now).map((item) => item.id);

  assert.deepEqual(firstPick, ['dedupe-1']);
  assert.deepEqual(secondPick, ['dedupe-1']);
});

test('canonical lifecycle ordering keeps upload and processing transitions monotonic', () => {
  const index = (stage: string) => FRONTEND_LIFECYCLE_ORDER.indexOf(stage as never);
  assert.equal(index('recorded_local') < index('queued_upload'), true);
  assert.equal(index('queued_upload') < index('uploading'), true);
  assert.equal(index('uploading') < index('transcribing'), true);
  assert.equal(index('transcribing') < index('processed'), true);
  assert.equal(index('processed') < index('note_visible'), true);
});
