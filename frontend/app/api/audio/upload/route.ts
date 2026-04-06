import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth/session';
import { store } from '@/lib/api/in-memory-store';

export async function POST(request: Request) {
  const userId = await requireUserId();
  const formData = await request.formData();

  const idempotencyKey = String(formData.get('idempotencyKey') ?? '');
  const clientRecordingId = String(formData.get('clientRecordingId') ?? '');
  const mimeType = String(formData.get('mimeType') ?? 'audio/webm');
  const durationMs = Number(formData.get('durationMs') ?? 0);

  if (!idempotencyKey || !clientRecordingId) {
    return NextResponse.json({ error: 'Missing idempotency key or recording id' }, { status: 400 });
  }

  const job = store.upsertJob({
    id: crypto.randomUUID(),
    userId,
    clientRecordingId,
    idempotencyKey,
    status: 'uploaded',
    audioStorageKey: `temp/${userId}/${clientRecordingId}.webm`,
    audioMimeType: mimeType,
    audioDurationMs: durationMs
  });

  // Real deployment: persist file in R2 and queue background job.
  setTimeout(() => {
    store.completeJobWithNote(job.id, ['Inbox', 'Voice'], 'Transcribed text placeholder from async worker.');
  }, 100);

  return NextResponse.json({ job_id: job.id, status: job.status });
}
