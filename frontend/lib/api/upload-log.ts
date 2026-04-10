import { createHash } from 'node:crypto';
import { scrubSensitiveFields } from './safe-logging';

export type UploadLogContext = {
  clientRecordingId: string;
  idempotencyKeyHash: string;
  mimeType: string;
  sizeBytes: number;
  durationMs: number;
};

export function buildUploadLogContext(input: Omit<UploadLogContext, 'idempotencyKeyHash'> & { idempotencyKey: string }) {
  return {
    clientRecordingId: input.clientRecordingId,
    idempotencyKeyHash: createHash('sha256').update(input.idempotencyKey).digest('hex').slice(0, 12),
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    durationMs: input.durationMs
  };
}

export function logUploadFailure(label: string, errorCode: string, error: unknown, context?: UploadLogContext) {
  console.error(label, JSON.stringify({ errorCode, context, safeDetails: scrubSensitiveFields(error) }));
}
