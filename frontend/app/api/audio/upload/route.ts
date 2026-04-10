import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth/session';
import { createUploadJob } from '@/lib/api/supabase-server';
import { scrubSensitiveFields } from '@/lib/api/safe-logging';
import { buildUploadLogContext, logUploadFailure, type UploadLogContext } from '@/lib/api/upload-log';
import { startProcessingJobWorkflow } from '@/lib/api/start-processing-job-workflow';
import {
  buildIdempotentTemporaryAudioStorageKey,
  deleteTemporaryAudio,
  putTemporaryAudio
} from '@/../backend/worker/storage/r2';

import { validateUploadInvariants } from '@/lib/api/upload-invariants';
import { parseClientCreatedAt } from '@/lib/api/upload-created-at';


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
  clientCreatedAt: string;
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
      client_created_at: job.clientCreatedAt,
      created_at: job.createdAt,
      updated_at: job.updatedAt
    }
  };
}

function invalidPayload(message: string, status = 400) {
  return NextResponse.json({ error: message, errorCode: 'INVALID_PAYLOAD' }, { status });
}

export async function POST(request: Request) {
  let logContext: UploadLogContext | undefined;

  try {
    const userId = await requireUserId(request);
    const formData = await request.formData();

    const idempotencyKey = String(formData.get('idempotencyKey') ?? '').trim();
    const clientRecordingId = String(formData.get('clientRecordingId') ?? '').trim();
    const durationMs = parseDurationMs(formData.get('durationMs'));
    const clientCreatedAt = parseClientCreatedAt(formData.get('createdAt'));
    const uploadedAudio = formData.get('audio') ?? formData.get('file');

    if (!idempotencyKey || !clientRecordingId) {
      return invalidPayload('Missing idempotency key or recording id');
    }

    if (!clientCreatedAt) {
      return invalidPayload('Missing or invalid createdAt (must be ISO-8601 with timezone)');
    }

    if (!(uploadedAudio instanceof File)) {
      return invalidPayload('Missing multipart audio file');
    }

    const rawMimeType = uploadedAudio.type || String(formData.get('mimeType') ?? '').trim() || 'application/octet-stream';
    const invariantResult = validateUploadInvariants({ mimeType: rawMimeType, sizeBytes: uploadedAudio.size });
    if (!invariantResult.ok) {
      return invalidPayload(invariantResult.message, invariantResult.status);
    }

    const mimeType = invariantResult.normalizedMimeType;
    const audioBytes = new Uint8Array(await uploadedAudio.arrayBuffer());
    logContext = buildUploadLogContext({
      clientRecordingId,
      idempotencyKey,
      mimeType,
      sizeBytes: uploadedAudio.size,
      durationMs
    });
    const storageKey = buildIdempotentTemporaryAudioStorageKey(userId, idempotencyKey, mimeType);
    try {
      await putTemporaryAudio(storageKey, audioBytes, mimeType);
    } catch (error) {
      logUploadFailure('[audio_upload_r2_put_failed]', 'AUDIO_STORAGE_WRITE_FAILED', error, logContext);
      throw error;
    }

    try {
      const job = await createUploadJob({
        userId,
        idempotencyKey,
        clientRecordingId,
        mimeType,
        durationMs,
        clientCreatedAt,
        audioStorageKey: storageKey
      });

      try {
        await startProcessingJobWorkflow(job.id, job.status);
      } catch (workflowError) {
        logUploadFailure('[audio_upload_workflow_start_failed]', 'UPLOAD_WORKFLOW_START_FAILED', workflowError, logContext);
      }

      const response = toAcceptedResponse(job);
      if (job.wasDuplicate) {
        return NextResponse.json({ ...response, errorCode: 'IDEMPOTENT_REPLAY' });
      }

      return NextResponse.json({ ...response, errorCode: 'UPLOAD_ACCEPTED' });
    } catch (dbError) {
      logUploadFailure('[audio_upload_db_create_failed]', 'UPLOAD_JOB_CREATE_FAILED', dbError, logContext);
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
    console.error(
      '[audio_upload_failed]',
      JSON.stringify({ errorCode: 'UPLOAD_FAILED', context: logContext, safeDetails: scrubSensitiveFields(error) })
    );
    return NextResponse.json({ error: 'Internal server error', errorCode: 'UPLOAD_FAILED' }, { status: 500 });
  }
}
