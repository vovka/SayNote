'use client';

import { FormEvent, useState } from 'react';
import { AuthGate } from '@/components/auth-gate';
import { AuthControls } from '@/components/auth-controls';
import { putAICredentials, putAIConfig } from '@/lib/api/client';

function SettingsPageContent() {
  const [provider, setProvider] = useState('groq');
  const [transcriptionModel, setTranscriptionModel] = useState('whisper-large-v3');
  const [categorizationModel, setCategorizationModel] = useState('llama-3.3-70b-versatile');
  const [apiKey, setApiKey] = useState('');
  const [message, setMessage] = useState('');

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    await putAIConfig({
      primaryProvider: provider,
      transcriptionModel,
      categorizationModel
    });
    if (apiKey) {
      await putAICredentials({ provider, apiKey });
      setApiKey('');
    }
    setMessage('Settings saved');
  }

  return (
    <main>
      <AuthControls />
      <h1>AI Settings</h1>
      <form onSubmit={onSubmit}>
        <label>Provider <input value={provider} onChange={(e) => setProvider(e.target.value)} /></label><br />
        <label>Transcription model <input value={transcriptionModel} onChange={(e) => setTranscriptionModel(e.target.value)} /></label><br />
        <label>Categorization model <input value={categorizationModel} onChange={(e) => setCategorizationModel(e.target.value)} /></label><br />
        <label>API key <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} /></label><br />
        <button type="submit">Save</button>
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
