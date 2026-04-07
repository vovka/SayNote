import { ProviderError } from './errors';
import {
  type AIConfigValidationFailure,
  type AIProviderConfigInput,
  type ValidatedAIProviderConfig,
  validateAIProviderConfig
} from '../../../shared/types/model-policy';

export type { AIProviderConfigInput, ValidatedAIProviderConfig } from '../../../shared/types/model-policy';

export function validateWorkerConfig(config: AIProviderConfigInput): ValidatedAIProviderConfig {
  const result = validateAIProviderConfig(config);
  if (result.ok) {
    return result.value;
  }

  throw mapPolicyValidationFailure(result.error);
}

export function mapPolicyValidationFailure(error: AIConfigValidationFailure): ProviderError {
  return new ProviderError({
    provider: error.provider,
    operation: error.operation ?? 'transcribe',
    kind: 'terminal',
    code: error.code,
    safeMessage: error.message
  });
}
