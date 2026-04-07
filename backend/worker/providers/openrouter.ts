import type { AIProviderAdapter, CategorizationResult, TranscriptionResult } from '../../../shared/types/provider';

export class OpenRouterAdapter implements AIProviderAdapter {
  async transcribe(input: { model: string; apiKey: string; audioUrl?: string; audioBuffer?: Buffer }): Promise<TranscriptionResult> {
    return { text: `[openrouter:${input.model}] transcription placeholder` };
  }

  async categorize(input: { text: string; model: string; apiKey: string }): Promise<CategorizationResult> {
    return { categoryPath: ['Inbox', 'Voice'] };
  }
}
