'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AuthGate } from '@/components/auth-gate';
import { AuthControls } from '@/components/auth-controls';
import { getAIConfig, putAICredentials, putAIConfig } from '@/lib/api/client';
import {
  ALL_SUPPORTED_PROVIDERS,
  buildCredentialStatusCopy,
  buildExecutionPathCopy,
  getDefaultSettingsFormState,
  getModelsForProvider,
  hydrateSettingsFormState,
  isSupportedProvider,
  validateSettingsFormState,
  type SettingsFormState
} from '@/lib/settings/ai-config-form';

function SettingsPageContent() {
  const [formState, setFormState] = useState<SettingsFormState>(getDefaultSettingsFormState);
  const [credentialInputs, setCredentialInputs] = useState<Record<'groq' | 'openrouter', string>>({ groq: '', openrouter: '' });
  const [providersWithKey, setProvidersWithKey] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isCancelled = false;

    async function loadConfig() {
      try {
        const config = await getAIConfig();
        if (isCancelled) return;
        setFormState((current) => hydrateSettingsFormState(current, config));
        setProvidersWithKey(config.providersWithKey ?? []);
      } catch {
        if (!isCancelled) {
          setMessage('Unable to load existing settings');
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadConfig();

    return () => {
      isCancelled = true;
    };
  }, []);

  const primaryTranscriptionModels = useMemo(() => getModelsForProvider(formState.primaryProvider, 'transcription'), [formState.primaryProvider]);
  const primaryCategorizationModels = useMemo(() => getModelsForProvider(formState.primaryProvider, 'categorization'), [formState.primaryProvider]);
  const fallbackTranscriptionModels = useMemo(() => getModelsForProvider(formState.fallbackProvider, 'transcription'), [formState.fallbackProvider]);
  const fallbackCategorizationModels = useMemo(() => getModelsForProvider(formState.fallbackProvider, 'categorization'), [formState.fallbackProvider]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const validation = validateSettingsFormState(formState);
    if (!validation.ok) {
      setMessage(validation.error.message);
      return;
    }

    await putAIConfig(validation.payload);
    setMessage('AI routing settings saved');
  }

  async function onSaveProviderKey(provider: 'groq' | 'openrouter') {
    const apiKey = credentialInputs[provider].trim();
    if (!apiKey) {
      setMessage(`Enter a ${provider} API key first`);
      return;
    }

    await putAICredentials({ provider, apiKey });
    setCredentialInputs((current) => ({ ...current, [provider]: '' }));
    setProvidersWithKey((current) => (current.includes(provider) ? current : [...current, provider]));
    setMessage(`${provider} key stored`);
  }

  function updateForm<K extends keyof SettingsFormState>(field: K, value: SettingsFormState[K]) {
    setFormState((current) => ({ ...current, [field]: value }));
  }

  return (
    <main>
      <AuthControls />
      <h1>AI Settings</h1>
      <p>{buildExecutionPathCopy(formState)}</p>
      {isLoading ? <p>Loading AI config…</p> : null}
      <form onSubmit={onSubmit}>
        <fieldset>
          <legend>Primary provider path</legend>
          <label>
            Primary provider
            <select value={formState.primaryProvider} onChange={(e) => updateForm('primaryProvider', e.target.value)}>
              {ALL_SUPPORTED_PROVIDERS.map((provider) => (
                <option key={provider} value={provider}>{provider}</option>
              ))}
            </select>
          </label><br />
          <label>
            Primary transcription model
            <select value={formState.transcriptionModel} onChange={(e) => updateForm('transcriptionModel', e.target.value)}>
              {primaryTranscriptionModels.map((model) => (
                <option key={model} value={model}>{model}</option>
              ))}
            </select>
          </label><br />
          <label>
            Primary categorization model
            <select value={formState.categorizationModel} onChange={(e) => updateForm('categorizationModel', e.target.value)}>
              {primaryCategorizationModels.map((model) => (
                <option key={model} value={model}>{model}</option>
              ))}
            </select>
          </label>
        </fieldset>

        <fieldset>
          <legend>Fallback provider path</legend>
          <label>
            Fallback provider
            <select value={formState.fallbackProvider} onChange={(e) => updateForm('fallbackProvider', e.target.value)}>
              <option value="">No fallback</option>
              {ALL_SUPPORTED_PROVIDERS.map((provider) => (
                <option key={provider} value={provider}>{provider}</option>
              ))}
            </select>
          </label><br />
          <label>
            Fallback transcription model
            <select
              value={formState.fallbackTranscriptionModel}
              onChange={(e) => updateForm('fallbackTranscriptionModel', e.target.value)}
              disabled={!isSupportedProvider(formState.fallbackProvider)}
            >
              <option value="">Select fallback transcription model</option>
              {fallbackTranscriptionModels.map((model) => (
                <option key={model} value={model}>{model}</option>
              ))}
            </select>
          </label><br />
          <label>
            Fallback categorization model
            <select
              value={formState.fallbackCategorizationModel}
              onChange={(e) => updateForm('fallbackCategorizationModel', e.target.value)}
              disabled={!isSupportedProvider(formState.fallbackProvider)}
            >
              <option value="">Select fallback categorization model</option>
              {fallbackCategorizationModels.map((model) => (
                <option key={model} value={model}>{model}</option>
              ))}
            </select>
          </label><br />
          <label>
            <input
              type="checkbox"
              checked={formState.fallbackOnTerminalPrimaryFailure}
              onChange={(e) => updateForm('fallbackOnTerminalPrimaryFailure', e.target.checked)}
            />
            Use fallback provider on terminal primary failures
          </label>
        </fieldset>

        <fieldset>
          <legend>Provider credentials (write-only)</legend>
          {(['groq', 'openrouter'] as const).map((provider) => (
            <div key={provider}>
              <p>{buildCredentialStatusCopy(provider, providersWithKey)}</p>
              <label>
                {provider} API key
                <input
                  type="password"
                  value={credentialInputs[provider]}
                  onChange={(e) => setCredentialInputs((current) => ({ ...current, [provider]: e.target.value }))}
                  placeholder={`Paste ${provider} key`}
                />
              </label>
              <button type="button" onClick={() => void onSaveProviderKey(provider)}>Save {provider} key</button>
            </div>
          ))}
        </fieldset>

        <button type="submit">Save AI routing settings</button>
      </form>
      <p>{message}</p>
    </main>
  );
}

export default function SettingsPage() {
  return (
    <AuthGate>
      <SettingsPageContent />
    </AuthGate>
  );
}
