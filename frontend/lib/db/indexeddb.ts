import Dexie, { type Table } from 'dexie';

export interface RecordingEntity {
  id: string;
  userId: string;
  audioBlob?: Blob;
  mimeType: string;
  durationMs: number;
  createdAt: string;
  status: 'recorded_local' | 'queued_upload' | 'uploading' | 'uploaded_waiting_processing' | 'processed' | 'failed_retryable' | 'failed_terminal';
  uploadRetryCount: number;
  processingRetryCount: number;
  nextUploadRetryAt?: string;
  nextProcessingRetryAt?: string;
  failedStage?: 'upload' | 'processing';
  uploadIdempotencyKey: string;
  serverJobId?: string;
  lastError?: string;
  statusUpdatedAt: string;
  uploadCompletedAt?: string;
  processedAt?: string;
}

class VoiceNotesDB extends Dexie {
  recordings!: Table<RecordingEntity, string>;

  constructor() {
    super('voiceNotesDB');
    this.version(1).stores({
      recordings: 'id, userId, status, nextRetryAt, createdAt, uploadIdempotencyKey'
    });
    this.version(2).stores({
      recordings: 'id, userId, status, nextUploadRetryAt, nextProcessingRetryAt, createdAt, statusUpdatedAt, uploadIdempotencyKey, serverJobId'
    });
  }
}

export const db = new VoiceNotesDB();
