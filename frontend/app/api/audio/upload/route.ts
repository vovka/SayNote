import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth/session';
import { upsertUploadJob } from '@/lib/api/supabase-server';

const ALLOWED_MIME_TYPES = new Set(['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav']);
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const userId = await requireUserId(request);
    const formData = await request.formData();

    const idempotencyKey = String(formData.get('idempotencyKey') ?? '');
    const clientRecordingId = String(formData.get('clientRecordingId') ?? '');
    const mimeType = String(formData.get('mimeType') ?? 'audio/webm');
    const durationMs = Number(formData.get('durationMs') ?? 0);
    const audioFile = formData.get('file');

    if (!idempotencyKey || !clientRecordingId) {
      return NextResponse.json({ error: 'Missing idempotency key or recording id' }, { status: 400 });
    }

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return NextResponse.json({ error: 'Unsupported audio type' }, { status: 415 });
    }

    if (audioFile instanceof File && audioFile.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: 'Audio file too large' }, { status: 413 });
    }

    const job = await upsertUploadJob({
      userId,
      idempotencyKey,
      clientRecordingId,
      mimeType,
      durationMs
    });

    return NextResponse.json({ job_id: job.id, status: job.status });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Upload route failed', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
