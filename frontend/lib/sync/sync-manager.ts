import { db } from '@/lib/db/indexeddb';
import { getJob, uploadAudio } from '@/lib/api/client';

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
    statusUpdatedAt: new Date().toISOString()
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
  await cleanupSyncedRecords();

  const now = new Date().toISOString();
  const queuedUploads = await db.recordings
    .where('status')
    .anyOf('queued_upload', 'failed_retryable')
    .toArray();

  for (const item of queuedUploads) {
    if (item.status === 'failed_retryable' && item.failedStage !== 'upload') continue;
    if (item.nextUploadRetryAt && item.nextUploadRetryAt > now) continue;
    await uploadOne(item.id);
  }

  const processingQueue = await db.recordings
    .where('status')
    .anyOf('uploaded_waiting_processing', 'failed_retryable')
    .toArray();
  for (const item of processingQueue) {
    if (item.status === 'failed_retryable' && item.failedStage !== 'processing') continue;
    if (!item.serverJobId) continue;
    if (item.nextProcessingRetryAt && item.nextProcessingRetryAt > now) continue;
    await pollJobStatus(item.id);
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

  await db.recordings.update(id, { status: 'uploading', failedStage: undefined, lastError: undefined, statusUpdatedAt: new Date().toISOString() });

  const form = new FormData();
  form.append('audio', item.audioBlob, `${item.id}.webm`);
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
      uploadCompletedAt: new Date().toISOString()
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
      statusUpdatedAt: new Date().toISOString()
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
        lastError: undefined
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
        nextProcessingRetryAt: undefined
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
        statusUpdatedAt: now
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
      status: retryCount >= PROCESSING_RETRY_POLICY.maxRetries ? 'failed_terminal' : item.status,
      processingRetryCount: retryCount,
      failedStage: 'processing',
      lastError: error instanceof Error ? error.message : 'Processing status lookup failed',
      nextProcessingRetryAt: new Date(Date.now() + delay).toISOString(),
      statusUpdatedAt: new Date().toISOString()
    });
  }
}

function emitSyncJobCompleted(detail: { recordingId: string; serverJobId: string }) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SYNC_JOB_COMPLETED_EVENT, { detail }));
}

async function cleanupSyncedRecords() {
  const now = Date.now();
  const all = await db.recordings.toArray();
  for (const item of all) {
    if (item.audioBlob && (item.status === 'uploaded_waiting_processing' || item.status === 'processed')) {
      await db.recordings.update(item.id, { audioBlob: undefined });
    }

    if (item.status === 'processed' && item.processedAt && now - Date.parse(item.processedAt) > CLEANUP_POLICY.processedTtlMs) {
      await db.recordings.delete(item.id);
      continue;
    }

    if (item.status === 'failed_terminal' && now - Date.parse(item.statusUpdatedAt) > CLEANUP_POLICY.terminalFailureTtlMs) {
      await db.recordings.delete(item.id);
    }
  }
}

function computeBackoffMs(retryCount: number, baseMs: number, capMs: number) {
  const exp = Math.min(capMs, baseMs * Math.pow(2, retryCount));
  const jitter = Math.floor(Math.random() * 400);
  return exp + jitter;
}
