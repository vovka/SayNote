export interface SyncRecording {
  id: string;
  status: 'recorded_local' | 'queued_upload' | 'uploading' | 'failed_retryable' | 'uploaded_waiting_processing' | 'processed' | 'failed_terminal';
  failedStage?: 'upload' | 'processing';
  nextUploadRetryAt?: string;
  nextProcessingRetryAt?: string;
  serverJobId?: string;
  statusUpdatedAt?: string;
}

function isStale(statusUpdatedAt: string | undefined, nowMs: number, staleMs: number) {
  if (!statusUpdatedAt) return false;
  const updatedAtMs = Date.parse(statusUpdatedAt);
  if (Number.isNaN(updatedAtMs)) return false;
  return nowMs - updatedAtMs > staleMs;
}

export function pickStaleUploadRecoveryQueue(items: SyncRecording[], nowIso: string, staleMs: number) {
  const nowMs = Date.parse(nowIso);
  return items.filter((item) => item.status === 'uploading' && isStale(item.statusUpdatedAt, nowMs, staleMs));
}

export function pickStaleProcessingRecoveryQueue(items: SyncRecording[], nowIso: string, staleMs: number) {
  const nowMs = Date.parse(nowIso);
  return items.filter((item) => {
    if (!item.serverJobId || !isStale(item.statusUpdatedAt, nowMs, staleMs)) return false;
    if (item.status === 'uploaded_waiting_processing') return true;
    return item.status === 'failed_retryable' && item.failedStage === 'processing';
  });
}

export function pickUploadQueue(items: SyncRecording[], nowIso: string) {
  return items.filter((item) => {
    if (item.status === 'queued_upload') return true;
    if (item.status !== 'failed_retryable' || item.failedStage !== 'upload') return false;
    if (!item.nextUploadRetryAt) return true;
    return item.nextUploadRetryAt <= nowIso;
  });
}

export function pickProcessingQueue(items: SyncRecording[], nowIso: string) {
  return items.filter((item) => {
    if (!item.serverJobId) return false;
    if (item.status === 'uploaded_waiting_processing') {
      return !item.nextProcessingRetryAt || item.nextProcessingRetryAt <= nowIso;
    }
    if (item.status === 'failed_retryable' && item.failedStage === 'processing') {
      return !item.nextProcessingRetryAt || item.nextProcessingRetryAt <= nowIso;
    }
    return false;
  });
}
