import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth/session';
import { createUploadJob } from '@/lib/api/supabase-server';
import {
  buildIdempotentTemporaryAudioStorageKey,
  deleteTemporaryAudio,
  putTemporaryAudio
} from '@/../backend/worker/storage/r2';

import { validateUploadInvariants } from '@/lib/api/upload-invariants';

function parseDurationMs(raw: FormDataEntryValue | null) {
  const parsed = Number(raw ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function toAcceptedResponse(job: {
  id: string;
  status: string;
  clientRecordingId: string;
  idempotencyKey: string;
  audioStorageKey: string | null;
  audioMimeType: string;
  audioDurationMs: number | null;
  createdAt: string;
  updatedAt: string;
}) {
  return {
    job_id: job.id,
    accepted: true,
    job: {
      id: job.id,
      status: job.status,
      client_recording_id: job.clientRecordingId,
      idempotency_key: job.idempotencyKey,
      audio_storage_key: job.audioStorageKey,
      audio_mime_type: job.audioMimeType,
      audio_duration_ms: job.audioDurationMs,
      created_at: job.createdAt,
      updated_at: job.updatedAt
    }
  };
}

function invalidPayload(message: string, status = 400) {
  return NextResponse.json({ error: message, code: 'INVALID_PAYLOAD' }, { status });
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId(request);
    const formData = await request.formData();

    const idempotencyKey = String(formData.get('idempotencyKey') ?? '').trim();
    const clientRecordingId = String(formData.get('clientRecordingId') ?? '').trim();
    const durationMs = parseDurationMs(formData.get('durationMs'));
    const uploadedAudio = formData.get('audio') ?? formData.get('file');

    if (!idempotencyKey || !clientRecordingId) {
      return invalidPayload('Missing idempotency key or recording id');
    }

    if (!(uploadedAudio instanceof File)) {
      return invalidPayload('Missing multipart audio file');
    }

    const mimeType = uploadedAudio.type || 'application/octet-stream';
    const invariantResult = validateUploadInvariants({ mimeType, sizeBytes: uploadedAudio.size });
    if (!invariantResult.ok) {
      return invalidPayload(invariantResult.message, invariantResult.status);
    }

    const audioBytes = new Uint8Array(await uploadedAudio.arrayBuffer());
    const storageKey = buildIdempotentTemporaryAudioStorageKey(userId, idempotencyKey, mimeType);
    await putTemporaryAudio(storageKey, audioBytes, mimeType);

    try {
      const job = await createUploadJob({
        userId,
        idempotencyKey,
        clientRecordingId,
        mimeType,
        durationMs,
        audioStorageKey: storageKey
      });

      const response = toAcceptedResponse(job);
      if (job.wasDuplicate) {
        return NextResponse.json({ ...response, code: 'IDEMPOTENT_REPLAY' });
      }

      return NextResponse.json({ ...response, code: 'UPLOAD_ACCEPTED' });
    } catch (dbError) {
      try {
        await deleteTemporaryAudio(storageKey);
      } catch (cleanupError) {
        console.warn('Failed to rollback uploaded audio object after DB failure', cleanupError);
      }
      throw dbError;
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Upload route failed', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
