export async function cleanupTemporaryAudioAfterCompletion(input: {
  jobId: string;
  userId: string;
  audioStorageKey: string;
  deleteAudio: (storageKey: string) => Promise<unknown>;
  logFailure: (payload: {
    jobId: string;
    userId: string;
    provider?: string;
    errorCode: string;
    error: unknown;
  }) => void;
}) {
  try {
    await input.deleteAudio(input.audioStorageKey);
  } catch (cleanupError) {
    input.logFailure({
      jobId: input.jobId,
      userId: input.userId,
      provider: 'r2',
      errorCode: 'TEMP_AUDIO_DELETE_FAILED',
      error: cleanupError
    });
  }
}
