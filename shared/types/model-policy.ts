export type SupportedProvider = 'groq' | 'openrouter';
export type ProviderOperation = 'transcribe' | 'categorize';

export interface ProviderModelPolicy {
  transcription: readonly string[];
  categorization: readonly string[];
}

export const PROVIDER_MODEL_POLICY: Record<SupportedProvider, ProviderModelPolicy> = {
  groq: {
    transcription: ['whisper-large-v3', 'whisper-large-v3-turbo'],
    categorization: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant']
  },
  openrouter: {
    transcription: ['openai/gpt-4o-mini-transcribe'],
    categorization: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-haiku']
  }
};

export interface AIProviderConfigInput {
  primaryProvider: string;
  transcriptionModel: string;
  categorizationModel: string;
  fallbackProvider?: string | null;
  fallbackTranscriptionModel?: string | null;
  fallbackCategorizationModel?: string | null;
  fallbackOnTerminalPrimaryFailure?: boolean;
}

export interface ValidatedAIProviderConfig {
  primaryProvider: SupportedProvider;
  transcriptionModel: string;
  categorizationModel: string;
  fallbackProvider: SupportedProvider | null;
  fallbackTranscriptionModel: string | null;
  fallbackCategorizationModel: string | null;
  fallbackOnTerminalPrimaryFailure: boolean;
}

export type AIConfigValidationCode =
  | 'UNSUPPORTED_PROVIDER'
  | 'UNSUPPORTED_MODEL_COMBINATION'
  | 'INCOMPLETE_FALLBACK_CONFIGURATION';

export interface AIConfigValidationFailure {
  code: AIConfigValidationCode;
  provider: string;
  operation?: ProviderOperation;
  message: string;
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

export function normalizeProvider(provider: string): string {
  return normalize(provider);
}

export function isSupportedProvider(provider: string): provider is SupportedProvider {
  return normalize(provider) in PROVIDER_MODEL_POLICY;
}

export function isSupportedModel(provider: string, operation: ProviderOperation, model: string): boolean {
  if (!isSupportedProvider(provider)) {
    return false;
  }

  const normalizedProvider = normalize(provider) as SupportedProvider;
  const key = operation === 'transcribe' ? 'transcription' : 'categorization';
  return PROVIDER_MODEL_POLICY[normalizedProvider][key].includes(model.trim());
}

export function validateAIProviderConfig(input: AIProviderConfigInput):
  | { ok: true; value: ValidatedAIProviderConfig }
  | { ok: false; error: AIConfigValidationFailure } {
  const primaryProvider = normalizeProvider(input.primaryProvider);
  const transcriptionModel = input.transcriptionModel.trim();
  const categorizationModel = input.categorizationModel.trim();

  if (!isSupportedProvider(primaryProvider)) {
    return {
      ok: false,
      error: {
        code: 'UNSUPPORTED_PROVIDER',
        provider: primaryProvider,
        message: `Unsupported provider: ${input.primaryProvider}`
      }
    };
  }

  if (!isSupportedModel(primaryProvider, 'transcribe', transcriptionModel)) {
    return {
      ok: false,
      error: {
        code: 'UNSUPPORTED_MODEL_COMBINATION',
        provider: primaryProvider,
        operation: 'transcribe',
        message: `Model ${transcriptionModel} is not supported for ${primaryProvider} transcription`
      }
    };
  }

  if (!isSupportedModel(primaryProvider, 'categorize', categorizationModel)) {
    return {
      ok: false,
      error: {
        code: 'UNSUPPORTED_MODEL_COMBINATION',
        provider: primaryProvider,
        operation: 'categorize',
        message: `Model ${categorizationModel} is not supported for ${primaryProvider} categorization`
      }
    };
  }

  const fallbackProviderRaw = input.fallbackProvider ? normalizeProvider(input.fallbackProvider) : null;
  const fallbackTranscriptionModel = input.fallbackTranscriptionModel?.trim() ?? null;
  const fallbackCategorizationModel = input.fallbackCategorizationModel?.trim() ?? null;
  const fallbackParts = [fallbackProviderRaw, fallbackTranscriptionModel, fallbackCategorizationModel];
  const hasAnyFallbackPart = fallbackParts.some(Boolean);
  const hasAllFallbackParts = fallbackParts.every(Boolean);

  if (hasAnyFallbackPart && !hasAllFallbackParts) {
    return {
      ok: false,
      error: {
        code: 'INCOMPLETE_FALLBACK_CONFIGURATION',
        provider: fallbackProviderRaw ?? 'fallback',
        message: 'Fallback provider and both fallback models must be configured together'
      }
    };
  }

  if (fallbackProviderRaw && !isSupportedProvider(fallbackProviderRaw)) {
    return {
      ok: false,
      error: {
        code: 'UNSUPPORTED_PROVIDER',
        provider: fallbackProviderRaw,
        message: `Unsupported provider: ${input.fallbackProvider}`
      }
    };
  }

  if (fallbackProviderRaw && fallbackTranscriptionModel && !isSupportedModel(fallbackProviderRaw, 'transcribe', fallbackTranscriptionModel)) {
    return {
      ok: false,
      error: {
        code: 'UNSUPPORTED_MODEL_COMBINATION',
        provider: fallbackProviderRaw,
        operation: 'transcribe',
        message: `Model ${fallbackTranscriptionModel} is not supported for ${fallbackProviderRaw} transcription`
      }
    };
  }

  if (fallbackProviderRaw && fallbackCategorizationModel && !isSupportedModel(fallbackProviderRaw, 'categorize', fallbackCategorizationModel)) {
    return {
      ok: false,
      error: {
        code: 'UNSUPPORTED_MODEL_COMBINATION',
        provider: fallbackProviderRaw,
        operation: 'categorize',
        message: `Model ${fallbackCategorizationModel} is not supported for ${fallbackProviderRaw} categorization`
      }
    };
  }

  return {
    ok: true,
    value: {
      primaryProvider,
      transcriptionModel,
      categorizationModel,
      fallbackProvider: (fallbackProviderRaw as SupportedProvider | null) ?? null,
      fallbackTranscriptionModel,
      fallbackCategorizationModel,
      fallbackOnTerminalPrimaryFailure: Boolean(input.fallbackOnTerminalPrimaryFailure)
    }
  };
}
