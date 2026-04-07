import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth/session';
import { createUploadJob } from '@/lib/api/supabase-server';
import { scrubSensitiveFields } from '@/lib/api/safe-logging';
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
  return NextResponse.json({ error: message, errorCode: 'INVALID_PAYLOAD' }, { status });
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
        return NextResponse.json({ ...response, errorCode: 'IDEMPOTENT_REPLAY' });
      }

      return NextResponse.json({ ...response, errorCode: 'UPLOAD_ACCEPTED' });
    } catch (dbError) {
      try {
        await deleteTemporaryAudio(storageKey);
      } catch (cleanupError) {
        console.warn(
          '[audio_upload_cleanup_failed]',
          JSON.stringify({
            errorCode: 'AUDIO_UPLOAD_CLEANUP_FAILED',
            safeDetails: scrubSensitiveFields(cleanupError)
          })
        );
      }
      throw dbError;
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', errorCode: 'UNAUTHORIZED' }, { status: 401 });
    }
    if (error instanceof TypeError) {
      console.error(
        '[audio_upload_parse_failed]',
        JSON.stringify({ errorCode: 'INVALID_UPLOAD_PAYLOAD', safeDetails: scrubSensitiveFields(error) })
      );
      return NextResponse.json({ error: 'Invalid upload payload', errorCode: 'INVALID_UPLOAD_PAYLOAD' }, { status: 400 });
    }
    console.error('[audio_upload_failed]', JSON.stringify({ errorCode: 'UPLOAD_FAILED', safeDetails: scrubSensitiveFields(error) }));
    return NextResponse.json({ error: 'Internal server error', errorCode: 'UPLOAD_FAILED' }, { status: 500 });
  }
}
