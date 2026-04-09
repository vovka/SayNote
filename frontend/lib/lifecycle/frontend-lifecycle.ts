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
  if (stage === 'recorded_local') return 'Recorded locally';
  if (stage === 'queued_upload') return 'Queued for upload';
  if (stage === 'uploading') return 'Uploading';
  if (stage === 'uploaded_waiting_processing' || stage === 'transcribing') return 'Transcribing';
  if (stage === 'processed') return 'Processed';
  if (stage === 'note_visible') return 'Note visible';
  if (stage === 'failed_upload_retryable') return `Upload failed (retry ${retries})`;
  if (stage === 'failed_upload_terminal') return 'Upload failed permanently';
  if (stage === 'failed_processing_retryable') return `Transcription failed (retry ${retries})`;
  return 'Transcription failed permanently';
}

export function isFrontendLifecycleStage(value: string | undefined): value is FrontendLifecycleStage {
  if (!value) return false;
  return FRONTEND_LIFECYCLE_ORDER.includes(value as FrontendLifecycleStage);
}
