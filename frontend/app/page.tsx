'use client';

import { useEffect, useMemo, useState } from 'react';
import { startRecording, stopRecording } from '@/lib/recording/media-recorder';
import { queueRecording, startSyncLoop } from '@/lib/sync/sync-manager';
import { registerServiceWorker } from '@/lib/pwa/register-sw';

export default function RecordPage() {
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState('Ready');

  useEffect(() => {
    registerServiceWorker();
    const stop = startSyncLoop();
    return () => stop();
  }, []);

  const buttonText = useMemo(() => (recording ? 'Stop' : 'Record'), [recording]);

  async function onTapRecord() {
    if (!recording) {
      await startRecording();
      setRecording(true);
      setStatus('Recording');
      return;
    }

    const payload = await stopRecording();
    if (!payload) {
      setStatus('No audio captured');
      setRecording(false);
      return;
    }

    await queueRecording(payload);
    setStatus(navigator.onLine ? 'Saved locally, uploading' : 'Saved locally, upload queued');
    setRecording(false);
  }

  return (
    <main style={{ minHeight: '85vh', display: 'grid', placeItems: 'center' }}>
      <div style={{ textAlign: 'center' }}>
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
