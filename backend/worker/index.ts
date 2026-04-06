import { processJob } from './jobs/process-job';

export async function runWorkerExample() {
  return processJob({
    provider: 'groq',
    transcriptionModel: 'whisper-large-v3',
    categorizationModel: 'llama-3.3-70b-versatile',
    apiKey: 'redacted',
    audioUrl: 'r2://temp/demo/file.webm'
  });
}
