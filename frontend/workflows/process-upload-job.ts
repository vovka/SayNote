import { sleep } from 'workflow';
import type { ProcessingJobRow } from '@/../backend/worker/db';

const retryDelayMs = Math.max(1000, Number(process.env.PROCESSING_RETRY_DELAY_MS ?? 2000));

async function claimJob(jobId: string) {
  'use step';
  const { claimJobById } = await import('@/../backend/worker/claim-job-by-id');
  return claimJobById(jobId);
}

async function processClaimedJob(job: ProcessingJobRow) {
  'use step';
  const [{ withClient }, { processJob }] = await Promise.all([
    import('@/../backend/worker/db'),
    import('@/../backend/worker/jobs/process-job')
  ]);
  return withClient((client) => processJob(client, job));
}

function shouldRetry(status: 'completed' | 'failed_retryable' | 'failed_terminal') {
  return status === 'failed_retryable';
}

export async function processUploadJobWorkflow(jobId: string) {
  'use workflow';
  while (true) {
    const job = await claimJob(jobId);
    if (!job) return { jobId, status: 'skipped' as const };
    const result = await processClaimedJob(job);
    if (!shouldRetry(result.status)) return { jobId, status: result.status };
    await sleep(retryDelayMs);
  }
}
