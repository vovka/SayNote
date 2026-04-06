export interface TranscriptionResult {
  text: string;
  raw?: unknown;
}

export interface CategorizationResult {
  categoryPath: string[];
  confidence?: number;
  raw?: unknown;
}

export interface AIProviderAdapter {
  transcribe(input: {
    audioUrl?: string;
    audioBuffer?: Buffer;
    model: string;
    apiKey: string;
    metadata?: Record<string, unknown>;
  }): Promise<TranscriptionResult>;

  categorize(input: {
    text: string;
    model: string;
    apiKey: string;
    allowedCategories?: string[];
    metadata?: Record<string, unknown>;
  }): Promise<CategorizationResult>;
}
