import { isProviderError } from '../providers/errors';
import { validateWorkerConfig } from '../providers/model-policy';
import { shouldTryFallback as decideFallback } from './fallback-policy';

export interface ProcessingAttempt {
  provider: string;
  transcriptionModel: string;
  categorizationModel: string;
  isPrimary: boolean;
}

export function getAttempts(config: {
  primary_provider: string;
  transcription_model: string;
  categorization_model: string;
  fallback_provider: string | null;
  fallback_transcription_model: string | null;
  fallback_categorization_model: string | null;
  fallback_on_terminal_primary_failure?: boolean;
}) {
  const validated = validateWorkerConfig({
    primaryProvider: config.primary_provider,
    transcriptionModel: config.transcription_model,
    categorizationModel: config.categorization_model,
    fallbackProvider: config.fallback_provider,
    fallbackTranscriptionModel: config.fallback_transcription_model,
    fallbackCategorizationModel: config.fallback_categorization_model,
    fallbackOnTerminalPrimaryFailure: config.fallback_on_terminal_primary_failure
  });

  const attempts: ProcessingAttempt[] = [
    {
      provider: validated.primaryProvider,
      transcriptionModel: validated.transcriptionModel,
      categorizationModel: validated.categorizationModel,
      isPrimary: true
    }
  ];

  if (validated.fallbackProvider && validated.fallbackTranscriptionModel && validated.fallbackCategorizationModel) {
    attempts.push({
      provider: validated.fallbackProvider,
      transcriptionModel: validated.fallbackTranscriptionModel,
      categorizationModel: validated.fallbackCategorizationModel,
      isPrimary: false
    });
  }

  return {
    attempts,
    fallbackOnTerminalPrimaryFailure: validated.fallbackOnTerminalPrimaryFailure
  };
}

export function shouldTryFallback(input: {
  error: unknown;
  attempt: ProcessingAttempt;
  hasFallback: boolean;
  fallbackOnTerminalPrimaryFailure: boolean;
}) {
  const failureKind = isProviderError(input.error) && input.error.kind === 'terminal' ? 'terminal' : 'retryable';
  return decideFallback({
    failureKind,
    isPrimaryAttempt: input.attempt.isPrimary,
    hasFallback: input.hasFallback,
    fallbackOnTerminalPrimaryFailure: input.fallbackOnTerminalPrimaryFailure
  });
}
