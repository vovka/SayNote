import type { AIProviderAdapter } from '../../../shared/types/provider';

export class OpenRouterAdapter implements AIProviderAdapter {
  async transcribe(input: { model: string }): Promise<{ text: string }> {
    return { text: `[openrouter:${input.model}] transcription placeholder` };
  }

  async categorize(): Promise<{ categoryPath: string[] }> {
    return { categoryPath: ['Inbox', 'Voice'] };
  }
}
