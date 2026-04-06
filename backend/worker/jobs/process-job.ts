import { getProvider } from '../providers/registry';
import { normalizeCategoryPath } from '../categories/resolve-category-path';

export async function processJob(input: {
  provider: string;
  transcriptionModel: string;
  categorizationModel: string;
  apiKey: string;
  audioUrl: string;
}) {
  const adapter = getProvider(input.provider);
  const transcription = await adapter.transcribe({
    model: input.transcriptionModel,
    apiKey: input.apiKey,
    audioUrl: input.audioUrl
  });

  const categorization = await adapter.categorize({
    text: transcription.text,
    model: input.categorizationModel,
    apiKey: input.apiKey
  });

  return {
    text: transcription.text,
    categoryPath: normalizeCategoryPath(categorization.categoryPath)
  };
}
