import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth/session';
import { createUploadJob, getUploadJobByIdempotencyKey } from '@/lib/api/supabase-server';
import { buildTemporaryAudioStorageKey, putTemporaryAudio } from '@/../backend/worker/storage/r2';

const ALLOWED_MIME_TYPES = new Set(['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav']);
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

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

export async function POST(request: Request) {
  try {
    const userId = await requireUserId(request);
    const formData = await request.formData();

    const idempotencyKey = String(formData.get('idempotencyKey') ?? '').trim();
    const clientRecordingId = String(formData.get('clientRecordingId') ?? '').trim();
    const durationMs = parseDurationMs(formData.get('durationMs'));
    const uploadedAudio = formData.get('audio') ?? formData.get('file');

    if (!idempotencyKey || !clientRecordingId) {
      return NextResponse.json({ error: 'Missing idempotency key or recording id' }, { status: 400 });
    }

    const existing = await getUploadJobByIdempotencyKey(userId, idempotencyKey);
    if (existing) {
      return NextResponse.json(toAcceptedResponse(existing));
    }

    if (!(uploadedAudio instanceof File)) {
      return NextResponse.json({ error: 'Missing multipart audio file' }, { status: 400 });
    }

    const mimeType = uploadedAudio.type || 'application/octet-stream';
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return NextResponse.json({ error: 'Unsupported audio type' }, { status: 415 });
    }

    if (uploadedAudio.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: 'Audio file too large' }, { status: 413 });
    }

    const audioBytes = new Uint8Array(await uploadedAudio.arrayBuffer());
    const storageKey = buildTemporaryAudioStorageKey(userId, clientRecordingId, mimeType);
    await putTemporaryAudio(storageKey, audioBytes, mimeType);

    const job = await createUploadJob({
      userId,
      idempotencyKey,
      clientRecordingId,
      mimeType,
      durationMs,
      audioStorageKey: storageKey
    });

    return NextResponse.json(toAcceptedResponse(job));
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Upload route failed', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
