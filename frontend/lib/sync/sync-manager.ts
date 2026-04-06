import { db } from '@/lib/db/indexeddb';
import { uploadAudio } from '@/lib/api/client';

const RETRY_BASE_MS = 1_000;
const RETRY_CAP_MS = 60_000;

export async function queueRecording(payload: {
  audioBlob: Blob;
  mimeType: string;
  durationMs: number;
  createdAt: string;
}) {
  const id = crypto.randomUUID();
  const idempotencyKey = crypto.randomUUID();

  await db.recordings.put({
    id,
    userId: 'current-user',
    ...payload,
    status: 'queued_upload',
    retryCount: 0,
    uploadIdempotencyKey: idempotencyKey
  });

  if (navigator.onLine) {
    await runSync();
  }
}

export function startSyncLoop() {
  let timer: ReturnType<typeof setInterval> | undefined;

  const onOnline = () => {
    void runSync();
  };

  window.addEventListener('online', onOnline);
  window.addEventListener('focus', onOnline);
  timer = setInterval(() => void runSync(), 15_000);
  void runSync();

  return () => {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('focus', onOnline);
    if (timer) clearInterval(timer);
  };
}

async function runSync() {
  if (!navigator.onLine) return;

  const now = new Date().toISOString();
  const queued = await db.recordings
    .where('status')
    .anyOf('queued_upload', 'failed_retryable')
    .toArray();

  for (const item of queued) {
    if (item.nextRetryAt && item.nextRetryAt > now) continue;
    await uploadOne(item.id);
  }
}

async function uploadOne(id: string) {
  const item = await db.recordings.get(id);
  if (!item || !item.audioBlob) return;

  await db.recordings.update(id, { status: 'uploading', lastError: undefined });

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
      lastError: undefined
    });
  } catch (error) {
    const retryCount = item.retryCount + 1;
    const delay = computeBackoffMs(retryCount);
    await db.recordings.update(id, {
      status: retryCount >= 8 ? 'failed_terminal' : 'failed_retryable',
      retryCount,
      lastError: error instanceof Error ? error.message : 'Unknown error',
      nextRetryAt: new Date(Date.now() + delay).toISOString()
    });
  }
}

function computeBackoffMs(retryCount: number) {
  const exp = Math.min(RETRY_CAP_MS, RETRY_BASE_MS * Math.pow(2, retryCount));
  const jitter = Math.floor(Math.random() * 400);
  return exp + jitter;
}
