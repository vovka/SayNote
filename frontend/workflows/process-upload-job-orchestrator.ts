import type { ProcessingJobRow } from '@/../backend/worker/db';

type JobResult = { status: 'completed' | 'failed_retryable' | 'failed_terminal' };

export interface ProcessUploadJobDependencies {
  claimJobById(jobId: string): Promise<ProcessingJobRow | null>;
  processClaimedJob(job: ProcessingJobRow): Promise<JobResult>;
  waitForRetry(): Promise<void>;
}

export async function runProcessUploadJob(jobId: string, deps: ProcessUploadJobDependencies) {
  while (true) {
    const job = await deps.claimJobById(jobId);
    if (!job) return { jobId, status: 'skipped' as const };
    const result = await deps.processClaimedJob(job);
    if (result.status !== 'failed_retryable') return { jobId, status: result.status };
    await deps.waitForRetry();
  }
}
