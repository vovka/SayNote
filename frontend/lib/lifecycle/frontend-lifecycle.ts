import type { RecordingEntity } from '@/lib/db/indexeddb';

export const FRONTEND_LIFECYCLE_ORDER = [
  'recorded_local',
  'queued_upload',
  'uploading',
  'uploaded_waiting_processing',
  'transcribing',
  'processed',
  'note_visible',
  'failed_upload_retryable',
  'failed_upload_terminal',
  'failed_processing_retryable',
  'failed_processing_terminal'
] as const;

export type FrontendLifecycleStage = (typeof FRONTEND_LIFECYCLE_ORDER)[number];
export type ServerJobStatus = 'uploaded' | 'processing' | 'completed' | 'failed_retryable' | 'failed_terminal';

export function lifecycleStageFromRecording(item: RecordingEntity): FrontendLifecycleStage {
  if (item.status === 'failed_retryable' && item.failedStage === 'upload') return 'failed_upload_retryable';
  if (item.status === 'failed_terminal' && item.failedStage === 'upload') return 'failed_upload_terminal';
  if (item.status === 'failed_retryable' && item.failedStage === 'processing') return 'failed_processing_retryable';
  if (item.status === 'failed_terminal' && item.failedStage === 'processing') return 'failed_processing_terminal';
  if (item.status === 'uploaded_waiting_processing') return 'transcribing';
  if (item.status === 'failed_retryable') return 'failed_processing_retryable';
  if (item.status === 'failed_terminal') return 'failed_processing_terminal';
  return item.status;
}

export function lifecycleStageFromJobStatus(status: ServerJobStatus): FrontendLifecycleStage {
  if (status === 'uploaded' || status === 'processing') return 'transcribing';
  if (status === 'completed') return 'processed';
  if (status === 'failed_retryable') return 'failed_processing_retryable';
  return 'failed_processing_terminal';
}

export function labelForLifecycleStage(stage: FrontendLifecycleStage, retries = 0): string {
  switch (stage) {
    case 'recorded_local':
      return 'Recorded locally';
    case 'queued_upload':
      return 'Queued for upload';
    case 'uploading':
      return 'Uploading';
    case 'uploaded_waiting_processing':
    case 'transcribing':
      return 'Transcribing';
    case 'processed':
      return 'Processed';
    case 'note_visible':
      return 'Note visible';
    case 'failed_upload_retryable':
      return `Upload failed (retry ${retries})`;
    case 'failed_upload_terminal':
      return 'Upload failed permanently';
    case 'failed_processing_retryable':
      return `Transcription failed (retry ${retries})`;
    case 'failed_processing_terminal':
      return 'Transcription failed permanently';
  }
}

export function isFrontendLifecycleStage(value: string | undefined): value is FrontendLifecycleStage {
  if (!value) return false;
  return FRONTEND_LIFECYCLE_ORDER.includes(value as FrontendLifecycleStage);
}
