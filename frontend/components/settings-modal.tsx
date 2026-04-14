'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { getAIConfig, putAICredentials, putAIConfig } from '@/lib/api/client';
import {
  ALL_SUPPORTED_PROVIDERS,
  buildCredentialStatusCopy,
  buildExecutionPathCopy,
  getDefaultSettingsFormState,
  getDefaultTranscriptionPreferencesFormState,
  getModelsForProvider,
  hydrateSettingsFormState,
  hydrateTranscriptionPreferencesFormState,
  isSupportedProvider,
  type SettingsFormState,
  type TranscriptionPreferencesFormState,
  validateSettingsFormState
} from '@/lib/settings/ai-config-form';

type Provider = 'groq' | 'openrouter';

const LIVE_LANGUAGE_OPTIONS = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'uk-UA', label: 'Ukrainian' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'de-DE', label: 'German' },
  { value: 'fr-FR', label: 'French' },
  { value: 'es-ES', label: 'Spanish' }
];

export function SettingsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [formState, setFormState] = useState<SettingsFormState>(getDefaultSettingsFormState);
  const [preferences, setPreferences] = useState<TranscriptionPreferencesFormState>(
    getDefaultTranscriptionPreferencesFormState
  );
  const [credentialInputs, setCredentialInputs] = useState<Record<Provider, string>>({ groq: '', openrouter: '' });
  const [providersWithKey, setProvidersWithKey] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setIsLoading(true);
    setMessage('');
    setCredentialInputs({ groq: '', openrouter: '' });
    closeButtonRef.current?.focus();
    let isCancelled = false;
    const loadConfig = async () => {
      try {
        const config = await getAIConfig();
        if (isCancelled) return;
        setFormState((current) => hydrateSettingsFormState(current, config));
        setPreferences((current) => hydrateTranscriptionPreferencesFormState(current, config));
        setProvidersWithKey(config.providersWithKey ?? []);
      } catch {
        if (!isCancelled) setMessage('Unable to load existing settings');
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };
    void loadConfig();
    return () => {
      isCancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  const primaryTranscriptionModels = useMemo(
    () => getModelsForProvider(formState.primaryProvider, 'transcription'),
    [formState.primaryProvider]
  );
  const primaryCategorizationModels = useMemo(
    () => getModelsForProvider(formState.primaryProvider, 'categorization'),
    [formState.primaryProvider]
  );
  const fallbackTranscriptionModels = useMemo(
    () => getModelsForProvider(formState.fallbackProvider, 'transcription'),
    [formState.fallbackProvider]
  );
  const fallbackCategorizationModels = useMemo(
    () => getModelsForProvider(formState.fallbackProvider, 'categorization'),
    [formState.fallbackProvider]
  );

  const updateForm = <K extends keyof SettingsFormState>(field: K, value: SettingsFormState[K]) => {
    setFormState((current) => ({ ...current, [field]: value }));
  };

  const updatePreferences = <K extends keyof TranscriptionPreferencesFormState>(
    field: K,
    value: TranscriptionPreferencesFormState[K]
  ) => {
    setPreferences((current) => ({ ...current, [field]: value }));
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const validation = validateSettingsFormState(formState);
    if (!validation.ok) return setMessage(validation.error.message);
    try {
      await putAIConfig(validation.payload, preferences);
      setMessage('Settings saved');
    } catch {
      setMessage('Failed to save settings');
    }
  };

  const onSaveProviderKey = async (provider: Provider) => {
    const apiKey = credentialInputs[provider].trim();
    if (!apiKey) return setMessage(`Enter a ${provider} API key first`);
    try {
      await putAICredentials({ provider, apiKey });
      setCredentialInputs((current) => ({ ...current, [provider]: '' }));
      setProvidersWithKey((current) => (current.includes(provider) ? current : [...current, provider]));
      setMessage(`${provider} key stored`);
    } catch {
      setMessage(`Failed to store ${provider} key`);
    }
  };

  if (!isOpen) return null;

  return (
    <section
      aria-label="Settings backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 2000 }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        style={{
          maxWidth: 760,
          margin: '4vh auto',
          background: '#fff',
          padding: 16,
          maxHeight: '92vh',
          overflowY: 'auto'
        }}
      >
        <p style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 0 }}>
          <strong id="settings-modal-title">Settings</strong>
          <button ref={closeButtonRef} type="button" aria-label="Close settings" onClick={onClose}>
            Close
          </button>
        </p>
        <p>{buildExecutionPathCopy(formState, preferences)}</p>
        {isLoading ? <p>Loading settings…</p> : null}
        <form onSubmit={onSubmit}>
          <fieldset>
            <legend>Recording mode</legend>
            <p style={{ fontSize: '0.85em', color: '#555', marginTop: 0 }}>
              Standard mode works offline and processes notes in the background. Live mode requires an internet
              connection and streams audio to Azure Speech for real-time transcription.
            </p>
            <label>
              <input
                type="radio"
                name="transcriptionMode"
                value="standard_batch"
                checked={preferences.transcriptionMode === 'standard_batch'}
                onChange={() => updatePreferences('transcriptionMode', 'standard_batch')}
              />
              {' '}Standard (offline-capable)
            </label>
            <br />
            <label>
              <input
                type="radio"
                name="transcriptionMode"
                value="live_azure"
                checked={preferences.transcriptionMode === 'live_azure'}
                onChange={() => updatePreferences('transcriptionMode', 'live_azure')}
              />
              {' '}Live Azure transcription (online only)
            </label>
            {preferences.transcriptionMode === 'live_azure' && (
              <>
                <br />
                <label>
                  Live transcription language
                  <select
                    value={preferences.liveTranscriptionLanguage}
                    onChange={(e) => updatePreferences('liveTranscriptionLanguage', e.target.value)}
                  >
                    {LIVE_LANGUAGE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </fieldset>

          <fieldset>
            <legend>Categorization AI routing</legend>
            <fieldset>
              <legend>Primary provider path</legend>
              <label>
                Primary provider
                <select value={formState.primaryProvider} onChange={(e) => updateForm('primaryProvider', e.target.value)}>
                  {ALL_SUPPORTED_PROVIDERS.map((provider) => (
                    <option key={provider} value={provider}>
                      {provider}
                    </option>
                  ))}
                </select>
              </label>
              <br />
              {preferences.transcriptionMode === 'standard_batch' && (
                <>
                  <label>
                    Primary transcription model
                    <select
                      value={formState.transcriptionModel}
                      onChange={(e) => updateForm('transcriptionModel', e.target.value)}
                    >
                      {primaryTranscriptionModels.map((model) => (
                        <option key={model} value={model}>
                          {model}
                        </option>
                      ))}
                    </select>
                  </label>
                  <br />
                </>
              )}
              <label>
                Primary categorization model
                <select
                  value={formState.categorizationModel}
                  onChange={(e) => updateForm('categorizationModel', e.target.value)}
                >
                  {primaryCategorizationModels.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>

            <fieldset>
              <legend>Fallback provider path</legend>
              <label>
                Fallback provider
                <select
                  value={formState.fallbackProvider}
                  onChange={(e) => updateForm('fallbackProvider', e.target.value)}
                >
                  <option value="">No fallback</option>
                  {ALL_SUPPORTED_PROVIDERS.map((provider) => (
                    <option key={provider} value={provider}>
                      {provider}
                    </option>
                  ))}
                </select>
              </label>
              <br />
              {preferences.transcriptionMode === 'standard_batch' && (
                <>
                  <label>
                    Fallback transcription model
                    <select
                      value={formState.fallbackTranscriptionModel}
                      onChange={(e) => updateForm('fallbackTranscriptionModel', e.target.value)}
                      disabled={!isSupportedProvider(formState.fallbackProvider)}
                    >
                      <option value="">Select fallback transcription model</option>
                      {fallbackTranscriptionModels.map((model) => (
                        <option key={model} value={model}>
                          {model}
                        </option>
                      ))}
                    </select>
                  </label>
                  <br />
                </>
              )}
              <label>
                Fallback categorization model
                <select
                  value={formState.fallbackCategorizationModel}
                  onChange={(e) => updateForm('fallbackCategorizationModel', e.target.value)}
                  disabled={!isSupportedProvider(formState.fallbackProvider)}
                >
                  <option value="">Select fallback categorization model</option>
                  {fallbackCategorizationModels.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </label>
              <br />
              <label>
                <input
                  type="checkbox"
                  checked={formState.fallbackOnTerminalPrimaryFailure}
                  onChange={(e) => updateForm('fallbackOnTerminalPrimaryFailure', e.target.checked)}
                />
                Use fallback provider on terminal primary failures
              </label>
            </fieldset>
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
                <button type="button" onClick={() => void onSaveProviderKey(provider)}>
                  Save {provider} key
                </button>
              </div>
            ))}
          </fieldset>

          <button type="submit">Save settings</button>
        </form>
        <p>{message}</p>
      </div>
    </section>
  );
}
