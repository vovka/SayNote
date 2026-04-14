import {
  PROVIDER_MODEL_POLICY,
  validateAIProviderConfig,
  type AIProviderConfigInput,
  type SupportedProvider
} from '@/../shared/types/model-policy';

export type TranscriptionMode = 'standard_batch' | 'live_azure';

export interface SettingsFormState {
  primaryProvider: string;
  transcriptionModel: string;
  categorizationModel: string;
  fallbackProvider: string;
  fallbackTranscriptionModel: string;
  fallbackCategorizationModel: string;
  fallbackOnTerminalPrimaryFailure: boolean;
}

export interface TranscriptionPreferencesFormState {
  transcriptionMode: TranscriptionMode;
  liveTranscriptionLanguage: string;
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
  transcriptionMode: TranscriptionMode;
  liveTranscriptionLanguage: string;
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

export function getDefaultTranscriptionPreferencesFormState(): TranscriptionPreferencesFormState {
  return {
    transcriptionMode: 'standard_batch',
    liveTranscriptionLanguage: 'en-US'
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

export function hydrateTranscriptionPreferencesFormState(
  current: TranscriptionPreferencesFormState,
  response: AIConfigResponse
): TranscriptionPreferencesFormState {
  return {
    transcriptionMode: response.transcriptionMode ?? current.transcriptionMode,
    liveTranscriptionLanguage: response.liveTranscriptionLanguage ?? current.liveTranscriptionLanguage
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

export function buildExecutionPathCopy(
  formState: SettingsFormState,
  preferences: TranscriptionPreferencesFormState
): string {
  const fallbackSuffix = formState.fallbackProvider ? ` → ${formState.fallbackProvider}` : '';

  if (preferences.transcriptionMode === 'live_azure') {
    return `Recording mode: Azure live transcription (${preferences.liveTranscriptionLanguage}). Categorization path: ${formState.primaryProvider}${fallbackSuffix}.`;
  }

  if (!formState.fallbackProvider) {
    return `Recording mode: standard batch upload. Transcription + categorization path: ${formState.primaryProvider}. No fallback configured.`;
  }

  const terminalBehavior = formState.fallbackOnTerminalPrimaryFailure
    ? 'Fallback is enabled for retryable and terminal primary failures.'
    : 'Fallback is enabled for retryable primary failures only.';

  return `Recording mode: standard batch upload. Transcription + categorization path: ${formState.primaryProvider}${fallbackSuffix}. ${terminalBehavior}`;
}

export function buildCredentialStatusCopy(provider: string, providersWithKey: string[]): string {
  const hasStoredKey = providersWithKey.includes(provider);
  return hasStoredKey
    ? `${provider.toUpperCase()} key status: Stored`
    : `${provider.toUpperCase()} key status: Not stored`;
}
