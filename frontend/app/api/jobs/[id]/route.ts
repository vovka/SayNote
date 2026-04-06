import { NextResponse } from 'next/server';
import { store } from '@/lib/api/in-memory-store';
import { requireUserId } from '@/lib/auth/session';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id } = await params;
  const job = store.getJob(id);
  if (!job || job.userId !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({
    job_id: job.id,
    status: job.status,
    note_id: job.noteId ?? null,
    error_code: null
  });
}
