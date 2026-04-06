import type { AIProviderAdapter } from '../../../shared/types/provider';

export class GroqAdapter implements AIProviderAdapter {
  async transcribe(input: { model: string }): Promise<{ text: string }> {
    return { text: `[groq:${input.model}] transcription placeholder` };
  }

  async categorize(input: { text: string; model: string }): Promise<{ categoryPath: string[] }> {
    const lower = input.text.toLowerCase();
    if (lower.includes('project')) return { categoryPath: ['Work', 'Projects'] };
    return { categoryPath: ['Personal', 'General'] };
  }
}
