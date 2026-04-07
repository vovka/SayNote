export const ALLOWED_UPLOAD_MIME_TYPES = new Set(['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav']);
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export function validateUploadInvariants(input: { mimeType: string; sizeBytes: number }) {
  if (!ALLOWED_UPLOAD_MIME_TYPES.has(input.mimeType)) {
    return { ok: false as const, status: 415, message: 'Unsupported audio type' };
  }

  if (input.sizeBytes > MAX_UPLOAD_BYTES) {
    return { ok: false as const, status: 413, message: 'Audio file too large' };
  }

  return { ok: true as const };
}

export interface UploadJobLike {
  id: string;
  status: 'uploaded' | 'processing' | 'completed' | 'failed_retryable' | 'failed_terminal';
  clientRecordingId: string;
  idempotencyKey: string;
  audioStorageKey: string | null;
  audioMimeType: string;
  audioDurationMs: number | null;
  createdAt: string;
  updatedAt: string;
}

export async function createIdempotentUploadJob(input: {
  insert: () => Promise<UploadJobLike>;
  loadExisting: () => Promise<UploadJobLike | null>;
  isDuplicateError: (error: unknown) => boolean;
}) {
  try {
    const created = await input.insert();
    return { ...created, wasDuplicate: false as const };
  } catch (error) {
    if (!input.isDuplicateError(error)) {
      throw error;
    }

    const existing = await input.loadExisting();
    if (existing) {
      return { ...existing, wasDuplicate: true as const };
    }

    throw error;
  }
}
