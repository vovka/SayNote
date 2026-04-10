import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldStartProcessingWorkflow, startProcessingJobWorkflow } from './start-processing-job-workflow';

test('shouldStartProcessingWorkflow gates enqueueable statuses', () => {
  assert.equal(shouldStartProcessingWorkflow(undefined), true);
  assert.equal(shouldStartProcessingWorkflow('uploaded'), true);
  assert.equal(shouldStartProcessingWorkflow('failed_retryable'), true);
  assert.equal(shouldStartProcessingWorkflow('processing'), false);
  assert.equal(shouldStartProcessingWorkflow('completed'), false);
  assert.equal(shouldStartProcessingWorkflow('failed_terminal'), false);
});

test('startProcessingJobWorkflow invokes the workflow starter once', async () => {
  let started = 0;
  const startedOk = await startProcessingJobWorkflow(
    'job-1',
    'uploaded',
    async () => ({ runId: 'run-1' }),
    async () => (started += 1, async () => ({ status: 'completed' as const }))
  );
  assert.equal(startedOk, true);
  assert.equal(started, 1);
});
