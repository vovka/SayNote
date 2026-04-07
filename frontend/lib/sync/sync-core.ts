export interface SyncRecording {
  id: string;
  status: 'recorded_local' | 'queued_upload' | 'uploading' | 'failed_retryable' | 'uploaded_waiting_processing' | 'processed' | 'failed_terminal';
  failedStage?: 'upload' | 'processing';
  nextUploadRetryAt?: string;
  nextProcessingRetryAt?: string;
  serverJobId?: string;
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
