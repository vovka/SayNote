import {
  PROVIDER_MODEL_POLICY,
  validateAIProviderConfig,
  type AIProviderConfigInput,
  type SupportedProvider
} from '@/../shared/types/model-policy';

export interface SettingsFormState {
  primaryProvider: string;
  transcriptionModel: string;
  categorizationModel: string;
  fallbackProvider: string;
  fallbackTranscriptionModel: string;
  fallbackCategorizationModel: string;
  fallbackOnTerminalPrimaryFailure: boolean;
}

export interface AIConfigResponse {
  primaryProvider: string | null;
  transcriptionModel: string | null;
  categorizationModel: string | null;
  fallbackProvider: string | null;
  fallbackTranscriptionModel: string | null;
  fallbackCategorizationModel: string | null;
  fallbackOnTerminalPrimaryFailure: boolean;
  providersWithKey: string[];
}

export const ALL_SUPPORTED_PROVIDERS = Object.keys(PROVIDER_MODEL_POLICY) as SupportedProvider[];

export function isSupportedProvider(provider: string): provider is SupportedProvider {
  return ALL_SUPPORTED_PROVIDERS.includes(provider as SupportedProvider);
}

export function getModelsForProvider(provider: string, operation: 'transcription' | 'categorization'): readonly string[] {
  if (!isSupportedProvider(provider)) {
    return [];
  }
  return PROVIDER_MODEL_POLICY[provider][operation];
}

export function getDefaultSettingsFormState(): SettingsFormState {
  const defaultPrimaryProvider: SupportedProvider = 'groq';
  return {
    primaryProvider: defaultPrimaryProvider,
    transcriptionModel: PROVIDER_MODEL_POLICY[defaultPrimaryProvider].transcription[0],
    categorizationModel: PROVIDER_MODEL_POLICY[defaultPrimaryProvider].categorization[0],
    fallbackProvider: '',
    fallbackTranscriptionModel: '',
    fallbackCategorizationModel: '',
    fallbackOnTerminalPrimaryFailure: false
  };
}

export function hydrateSettingsFormState(current: SettingsFormState, response: AIConfigResponse): SettingsFormState {
  return {
    ...current,
    primaryProvider: response.primaryProvider ?? current.primaryProvider,
    transcriptionModel: response.transcriptionModel ?? current.transcriptionModel,
    categorizationModel: response.categorizationModel ?? current.categorizationModel,
    fallbackProvider: response.fallbackProvider ?? '',
    fallbackTranscriptionModel: response.fallbackTranscriptionModel ?? '',
    fallbackCategorizationModel: response.fallbackCategorizationModel ?? '',
    fallbackOnTerminalPrimaryFailure: response.fallbackOnTerminalPrimaryFailure
  };
}

export function validateSettingsFormState(formState: SettingsFormState):
  | { ok: true; payload: AIProviderConfigInput }
  | { ok: false; error: { message: string } } {
  const payload: AIProviderConfigInput = {
    primaryProvider: formState.primaryProvider,
    transcriptionModel: formState.transcriptionModel,
    categorizationModel: formState.categorizationModel,
    fallbackProvider: formState.fallbackProvider || undefined,
    fallbackTranscriptionModel: formState.fallbackTranscriptionModel || undefined,
    fallbackCategorizationModel: formState.fallbackCategorizationModel || undefined,
    fallbackOnTerminalPrimaryFailure: formState.fallbackOnTerminalPrimaryFailure
  };
  const validation = validateAIProviderConfig(payload);
  if (!validation.ok) {
    return { ok: false, error: { message: validation.error.message } };
  }
  return { ok: true, payload };
}

export function buildExecutionPathCopy(formState: SettingsFormState): string {
  if (!formState.fallbackProvider) {
    return `Active path: ${formState.primaryProvider} for transcription and categorization. No fallback path configured.`;
  }

  const terminalBehavior = formState.fallbackOnTerminalPrimaryFailure
    ? 'Fallback is enabled for retryable and terminal primary failures.'
    : 'Fallback is enabled for retryable primary failures only.';

  return `Active path: primary ${formState.primaryProvider} → fallback ${formState.fallbackProvider}. ${terminalBehavior}`;
}

export function buildCredentialStatusCopy(provider: string, providersWithKey: string[]): string {
  const hasStoredKey = providersWithKey.includes(provider);
  return hasStoredKey
    ? `${provider.toUpperCase()} key status: Stored`
    : `${provider.toUpperCase()} key status: Not stored`;
}
