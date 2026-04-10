import { start } from 'workflow/api';

type JobStatus = 'uploaded' | 'processing' | 'completed' | 'failed_retryable' | 'failed_terminal';
type WorkflowFn = (jobId: string) => Promise<unknown>;
type WorkflowStarter = (workflow: WorkflowFn, args: [string]) => Promise<unknown>;

async function loadWorkflow() {
  const mod = await import('@/workflows/process-upload-job');
  return mod.processUploadJobWorkflow;
}

export function shouldStartProcessingWorkflow(status?: JobStatus) {
  return status === undefined || status === 'uploaded' || status === 'failed_retryable';
}

export async function startProcessingJobWorkflow(
  jobId: string,
  status?: JobStatus,
  starter: WorkflowStarter = start as WorkflowStarter,
  workflowLoader: () => Promise<WorkflowFn> = loadWorkflow
) {
  if (!shouldStartProcessingWorkflow(status)) return false;
  await starter(await workflowLoader(), [jobId]);
  return true;
}
