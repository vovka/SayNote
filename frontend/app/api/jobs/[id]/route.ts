import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth/session';
import { getJobForUser } from '@/lib/api/supabase-server';
import { scrubSensitiveFields } from '@/lib/api/safe-logging';
import { startProcessingJobWorkflow } from '@/lib/api/start-processing-job-workflow';
import { lifecycleStageFromJobStatus } from '@/lib/lifecycle/frontend-lifecycle';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId(request);
    const { id } = await params;
    const job = await getJobForUser(id, userId);

    if (!job) {
      return NextResponse.json({ error: 'Not found', errorCode: 'JOB_NOT_FOUND' }, { status: 404 });
    }

    try {
      await startProcessingJobWorkflow(job.id, job.status);
    } catch (error) {
      console.warn('[job_lookup_workflow_start_failed]', JSON.stringify({ errorCode: 'JOB_WORKFLOW_START_FAILED', safeDetails: scrubSensitiveFields(error) }));
    }

    return NextResponse.json({
      job_id: job.id,
      status: job.status,
      lifecycle_stage: lifecycleStageFromJobStatus(job.status),
      error_code: job.error_code ?? null
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', errorCode: 'UNAUTHORIZED' }, { status: 401 });
    }
    console.error('[job_lookup_failed]', JSON.stringify({ errorCode: 'JOB_LOOKUP_FAILED', safeDetails: scrubSensitiveFields(error) }));
    return NextResponse.json({ error: 'Internal server error', errorCode: 'JOB_LOOKUP_FAILED' }, { status: 500 });
  }
}
