'use client';

import { useEffect, useMemo, useState } from 'react';
import { AuthGate } from '@/components/auth-gate';
import { AuthControls } from '@/components/auth-controls';
import { startRecording, stopRecording } from '@/lib/recording/media-recorder';
import { queueRecording, startSyncLoop } from '@/lib/sync/sync-manager';
import { registerServiceWorker } from '@/lib/pwa/register-sw';
import { getCurrentUserId } from '@/lib/api/client';

function RecordPageContent() {
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState('Ready');
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    registerServiceWorker();
    void getCurrentUserId().then(setUserId);
    const stop = startSyncLoop();
    return () => stop();
  }, []);

  const buttonText = useMemo(() => (recording ? 'Stop' : 'Record'), [recording]);

  async function onTapRecord() {
    if (!recording) {
      try {
        await startRecording();
        setRecording(true);
        setStatus('Recording');
      } catch {
        setStatus('Microphone access denied or unavailable');
      }
      return;
    }

    const payload = await stopRecording();
    if (!payload) {
      setStatus('No audio captured');
      setRecording(false);
      return;
    }

    if (!userId) {
      setStatus('Missing authenticated user. Please sign in again.');
      setRecording(false);
      return;
    }

    await queueRecording(userId, payload);
    setStatus(navigator.onLine ? 'Saved locally, uploading' : 'Saved locally, upload queued');
    setRecording(false);
  }

  return (
    <main style={{ minHeight: '85vh', display: 'grid', placeItems: 'center' }}>
      <div style={{ textAlign: 'center', minWidth: 260 }}>
        <AuthControls />
        <button
          onClick={onTapRecord}
          style={{
            width: 180,
            height: 180,
            borderRadius: '50%',
            border: 'none',
            background: recording ? '#e74c3c' : '#111',
            color: '#fff',
            fontSize: 24,
            cursor: 'pointer'
          }}
        >
          {buttonText}
        </button>
        <p style={{ marginTop: 16, opacity: 0.8 }}>{status}</p>
        <p><a href="/notes">View notes</a> · <a href="/settings">Settings</a></p>
      </div>
    </main>
  );
}

export default function RecordPage() {
  return (
    <AuthGate>
      <RecordPageContent />
    </AuthGate>
  );
}
