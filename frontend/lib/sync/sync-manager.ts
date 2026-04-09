import { db } from '@/lib/db/indexeddb';
import { getCurrentUserId, getJob, uploadAudio } from '@/lib/api/client';
import { audioFileExtension } from '../../../shared/audio-mime.ts';
import {
  pickProcessingQueue,
  pickStaleProcessingRecoveryQueue,
  pickStaleUploadRecoveryQueue,
  pickUploadQueue
} from '@/lib/sync/sync-core';

const UPLOAD_RETRY_POLICY = {
  maxRetries: 8,
  baseMs: 1_000,
  capMs: 60_000
} as const;

const PROCESSING_RETRY_POLICY = {
  maxRetries: 40,
  baseMs: 5_000,
  capMs: 60_000
} as const;

const CLEANUP_POLICY = {
  processedTtlMs: 24 * 60 * 60 * 1_000,
  terminalFailureTtlMs: 7 * 24 * 60 * 60 * 1_000
} as const;

const BG_SYNC_TAG = 'saynote-sync';
export const SYNC_JOB_COMPLETED_EVENT = 'saynote:job-completed';
export const UPLOADING_STALE_MS = 2 * 60 * 1_000;
export const PROCESSING_STALE_MS = 2 * 60 * 1_000;
let syncInFlight: Promise<void> | null = null;

export async function queueRecording(userId: string, payload: {
  audioBlob: Blob;
  mimeType: string;
  durationMs: number;
  createdAt: string;
}) {
  const id = crypto.randomUUID();
  const idempotencyKey = crypto.randomUUID();

  await db.recordings.put({
    id,
    userId,
    ...payload,
    status: 'queued_upload',
    uploadRetryCount: 0,
    processingRetryCount: 0,
    uploadIdempotencyKey: idempotencyKey,
    statusUpdatedAt: new Date().toISOString(),
    lifecycleStage: 'queued_upload'
  });

  if (navigator.onLine) {
    await triggerSyncNow();
    return;
  }

  await registerBackgroundSync();
}

export function startSyncLoop() {
  let timer: ReturnType<typeof setInterval> | undefined;

  const onOnline = () => {
    void triggerSyncNow();
  };

  const onServiceWorkerMessage = (event: MessageEvent) => {
    if (event.data?.type === 'saynote-sync-request') {
      void triggerSyncNow();
    }
  };

  window.addEventListener('online', onOnline);
  window.addEventListener('focus', onOnline);
  navigator.serviceWorker?.addEventListener('message', onServiceWorkerMessage);
  timer = setInterval(() => void triggerSyncNow(), 15_000);
  void triggerSyncNow();

  return () => {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('focus', onOnline);
    navigator.serviceWorker?.removeEventListener('message', onServiceWorkerMessage);
    if (timer) clearInterval(timer);
  };
}

export async function triggerSyncNow() {
  if (!syncInFlight) {
    syncInFlight = runSync().finally(() => {
      syncInFlight = null;
    });
  }
  await syncInFlight;
}

async function runSync() {
  if (!navigator.onLine) return;
  const userId = await getCurrentUserId();
  if (!userId) return;

  await recoverStaleSyncState(userId);
  await cleanupSyncedRecords(userId);

  const now = new Date().toISOString();
  const queuedUploads = await db.recordings
    .where('userId')
    .equals(userId)
    .and((item) => item.status === 'queued_upload' || item.status === 'failed_retryable')
    .toArray();

  for (const item of pickUploadQueue(queuedUploads, now)) {
    await uploadOne(item.id);
  }

  const processingQueue = await db.recordings
    .where('userId')
    .equals(userId)
    .and((item) => item.status === 'uploaded_waiting_processing' || item.status === 'failed_retryable')
    .toArray();
  for (const item of pickProcessingQueue(processingQueue, now)) {
    await pollJobStatus(item.id);
  }
}

export async function recoverStaleSyncState(userId: string, nowIso = new Date().toISOString()) {
  const uploadRecoveryCandidates = await db.recordings
    .where('userId')
    .equals(userId)
    .and((item) => item.status === 'uploading')
    .toArray();
  for (const item of pickStaleUploadRecoveryQueue(uploadRecoveryCandidates, nowIso, UPLOADING_STALE_MS)) {
    await db.recordings.update(item.id, {
      status: 'queued_upload',
      failedStage: undefined,
      lastError: undefined,
      nextUploadRetryAt: undefined,
      statusUpdatedAt: nowIso,
      lifecycleStage: 'queued_upload'
    });
  }

  const processingRecoveryCandidates = await db.recordings
    .where('userId')
    .equals(userId)
    .and((item) => item.status === 'uploaded_waiting_processing' || item.status === 'failed_retryable')
    .toArray();

  for (const item of pickStaleProcessingRecoveryQueue(processingRecoveryCandidates, nowIso, PROCESSING_STALE_MS)) {
    await db.recordings.update(item.id, {
      nextProcessingRetryAt: nowIso,
      statusUpdatedAt: nowIso,
      lifecycleStage: 'transcribing'
    });
  }
}

async function registerBackgroundSync() {
  if (typeof window === 'undefined') return false;
  if (!('serviceWorker' in navigator)) return false;
  if (!('SyncManager' in window)) return false;

  try {
    const registration = await navigator.serviceWorker.ready as ServiceWorkerRegistration & {
      sync?: { register: (tag: string) => Promise<void> };
    };
    if (!registration.sync) return false;
    await registration.sync.register(BG_SYNC_TAG);
    return true;
  } catch (_error) {
    return false;
  }
}

async function uploadOne(id: string) {
  const item = await db.recordings.get(id);
  if (!item || !item.audioBlob) return;

  await db.recordings.update(id, { status: 'uploading', failedStage: undefined, lastError: undefined, statusUpdatedAt: new Date().toISOString(), lifecycleStage: 'uploading' });

  const form = new FormData();
  form.append('audio', item.audioBlob, `${item.id}.${audioFileExtension(item.mimeType)}`);
  form.append('clientRecordingId', item.id);
  form.append('idempotencyKey', item.uploadIdempotencyKey);
  form.append('mimeType', item.mimeType);
  form.append('durationMs', String(item.durationMs));
  form.append('createdAt', item.createdAt);

  try {
    const result = await uploadAudio(form);
    await db.recordings.update(id, {
      status: 'uploaded_waiting_processing',
      audioBlob: undefined,
      serverJobId: result.job_id,
      lastError: undefined,
      nextUploadRetryAt: undefined,
      processingRetryCount: 0,
      nextProcessingRetryAt: new Date().toISOString(),
      failedStage: undefined,
      statusUpdatedAt: new Date().toISOString(),
      uploadCompletedAt: new Date().toISOString(),
      lifecycleStage: 'transcribing'
    });
  } catch (error) {
    const retryCount = (item.uploadRetryCount ?? 0) + 1;
    const delay = computeBackoffMs(retryCount, UPLOAD_RETRY_POLICY.baseMs, UPLOAD_RETRY_POLICY.capMs);
    await db.recordings.update(id, {
      status: retryCount >= UPLOAD_RETRY_POLICY.maxRetries ? 'failed_terminal' : 'failed_retryable',
      uploadRetryCount: retryCount,
      failedStage: 'upload',
      lastError: error instanceof Error ? error.message : 'Unknown error',
      nextUploadRetryAt: new Date(Date.now() + delay).toISOString(),
      statusUpdatedAt: new Date().toISOString(),
      lifecycleStage: retryCount >= UPLOAD_RETRY_POLICY.maxRetries ? 'failed_upload_terminal' : 'failed_upload_retryable'
    });
  }
}

async function pollJobStatus(id: string) {
  const item = await db.recordings.get(id);
  if (!item?.serverJobId) return;

  try {
    const result = await getJob(item.serverJobId);
    const now = new Date().toISOString();
    if (result.status === 'completed') {
      await db.recordings.update(id, {
        status: 'processed',
        processedAt: now,
        statusUpdatedAt: now,
        nextProcessingRetryAt: undefined,
        failedStage: undefined,
        lastError: undefined,
        lifecycleStage: 'processed'
      });
      emitSyncJobCompleted({ recordingId: id, serverJobId: item.serverJobId });
      return;
    }

    if (result.status === 'failed_terminal') {
      await db.recordings.update(id, {
        status: 'failed_terminal',
        failedStage: 'processing',
        lastError: result.error_code ?? 'Processing failed terminally',
        statusUpdatedAt: now,
        nextProcessingRetryAt: undefined,
        lifecycleStage: 'failed_processing_terminal'
      });
      return;
    }

    if (result.status === 'failed_retryable') {
      const retryCount = (item.processingRetryCount ?? 0) + 1;
      const delay = computeBackoffMs(retryCount, PROCESSING_RETRY_POLICY.baseMs, PROCESSING_RETRY_POLICY.capMs);
      await db.recordings.update(id, {
        status: retryCount >= PROCESSING_RETRY_POLICY.maxRetries ? 'failed_terminal' : 'failed_retryable',
        processingRetryCount: retryCount,
        failedStage: 'processing',
        lastError: result.error_code ?? 'Processing failed; will retry',
        nextProcessingRetryAt: new Date(Date.now() + delay).toISOString(),
        statusUpdatedAt: now,
        lifecycleStage: retryCount >= PROCESSING_RETRY_POLICY.maxRetries ? 'failed_processing_terminal' : 'failed_processing_retryable'
      });
      return;
    }

    const retryCount = (item.processingRetryCount ?? 0) + 1;
    const delay = computeBackoffMs(retryCount, PROCESSING_RETRY_POLICY.baseMs, PROCESSING_RETRY_POLICY.capMs);
    await db.recordings.update(id, {
      processingRetryCount: retryCount,
      nextProcessingRetryAt: new Date(Date.now() + delay).toISOString(),
      statusUpdatedAt: now
    });
  } catch (error) {
    const retryCount = (item.processingRetryCount ?? 0) + 1;
    const delay = computeBackoffMs(retryCount, PROCESSING_RETRY_POLICY.baseMs, PROCESSING_RETRY_POLICY.capMs);
    await db.recordings.update(id, {
      status: retryCount >= PROCESSING_RETRY_POLICY.maxRetries ? 'failed_terminal' : 'failed_retryable',
      processingRetryCount: retryCount,
      failedStage: 'processing',
      lastError: error instanceof Error ? error.message : 'Processing status lookup failed',
      nextProcessingRetryAt: new Date(Date.now() + delay).toISOString(),
      statusUpdatedAt: new Date().toISOString(),
      lifecycleStage: retryCount >= PROCESSING_RETRY_POLICY.maxRetries ? 'failed_processing_terminal' : 'failed_processing_retryable'
    });
  }
}

function emitSyncJobCompleted(detail: { recordingId: string; serverJobId: string }) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SYNC_JOB_COMPLETED_EVENT, { detail }));
}

async function cleanupSyncedRecords(userId: string) {
  const now = Date.now();
  const processedBefore = new Date(now - CLEANUP_POLICY.processedTtlMs).toISOString();
  const terminalFailureBefore = new Date(now - CLEANUP_POLICY.terminalFailureTtlMs).toISOString();

  await db.recordings
    .where('userId')
    .equals(userId)
    .and((item) => Boolean(item.audioBlob) && (item.status === 'uploaded_waiting_processing' || item.status === 'processed'))
    .modify({ audioBlob: undefined });

  await db.recordings
    .where('userId')
    .equals(userId)
    .and((item) => Boolean(item.processedAt) && item.status === 'processed' && item.processedAt! < processedBefore)
    .delete();

  await db.recordings
    .where('userId')
    .equals(userId)
    .and((item) => item.status === 'failed_terminal' && item.statusUpdatedAt < terminalFailureBefore)
    .delete();
}

function computeBackoffMs(retryCount: number, baseMs: number, capMs: number) {
  const exp = Math.min(capMs, baseMs * Math.pow(2, retryCount));
  const jitter = Math.floor(Math.random() * 400);
  return exp + jitter;
}
