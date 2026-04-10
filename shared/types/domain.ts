export type LocalRecordingStatus =
  | 'recorded_local'
  | 'queued_upload'
  | 'uploading'
  | 'uploaded_waiting_processing'
  | 'processed'
  | 'failed_retryable'
  | 'failed_terminal';

export type JobStatus =
  | 'pending_upload'
  | 'uploaded'
  | 'processing'
  | 'completed'
  | 'failed_retryable'
  | 'failed_terminal';

export interface LocalRecording {
  id: string;
  userId: string;
  audioBlob?: Blob;
  mimeType: string;
  durationMs: number;
  createdAt: string;
  status: LocalRecordingStatus;
  retryCount: number;
  nextRetryAt?: string;
  uploadIdempotencyKey: string;
  serverJobId?: string;
  lastError?: string;
}

export interface ProcessingJob {
  id: string;
  userId: string;
  clientRecordingId: string;
  idempotencyKey: string;
  status: JobStatus;
  audioStorageKey?: string;
  audioMimeType: string;
  audioDurationMs?: number;
  retryCount: number;
  errorCode?: string;
  errorMessageSafe?: string;
  providerUsed?: string;
  transcriptionModel?: string;
  categorizationModel?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}
