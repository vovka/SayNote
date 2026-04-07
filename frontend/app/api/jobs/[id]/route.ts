import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth/session';
import { getJobForUser } from '@/lib/api/supabase-server';
import { logSanitizedApiError } from '@/lib/api/logging';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId(request);
    const { id } = await params;
    const job = await getJobForUser(id, userId);

    if (!job) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({
      job_id: job.id,
      status: job.status,
      error_code: job.error_code ?? null
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    logSanitizedApiError('Job lookup failed', error, { route: '/api/jobs/[id]' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
