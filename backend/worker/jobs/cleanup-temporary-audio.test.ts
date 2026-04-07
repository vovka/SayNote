import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanupTemporaryAudioAfterCompletion } from './cleanup-temporary-audio.ts';

test('cleanupTemporaryAudioAfterCompletion logs and continues when delete fails', async () => {
  const failures: Array<{ errorCode: string; provider?: string; jobId: string; userId: string }> = [];

  await cleanupTemporaryAudioAfterCompletion({
    jobId: 'job_1',
    userId: 'user_1',
    audioStorageKey: 'audio/user_1/recording.webm',
    deleteAudio: async () => {
      throw new Error('delete failed');
    },
    logFailure: (input) => {
      failures.push({
        errorCode: input.errorCode,
        provider: input.provider,
        jobId: input.jobId,
        userId: input.userId
      });
    }
  });

  assert.deepEqual(failures, [
    {
      errorCode: 'TEMP_AUDIO_DELETE_FAILED',
      provider: 'r2',
      jobId: 'job_1',
      userId: 'user_1'
    }
  ]);
});
