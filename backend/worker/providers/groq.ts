import type { AIProviderAdapter, CategorizationResult, TranscriptionResult } from '../../../shared/types/provider';

export class GroqAdapter implements AIProviderAdapter {
  async transcribe(input: { model: string; apiKey: string; audioUrl?: string; audioBuffer?: Buffer }): Promise<TranscriptionResult> {
    return { text: `[groq:${input.model}] transcription placeholder` };
  }

  async categorize(input: { text: string; model: string; apiKey: string }): Promise<CategorizationResult> {
    const lower = input.text.toLowerCase();
    if (lower.includes('project')) return { categoryPath: ['Work', 'Projects'] };
    return { categoryPath: ['Personal', 'General'] };
  }
}
