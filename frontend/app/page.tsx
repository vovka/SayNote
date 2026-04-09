'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AuthGate } from '@/components/auth-gate';
import { AuthControls } from '@/components/auth-controls';
import {
  cancelRecording,
  startRecording,
  stopRecording,
  subscribeToRecordingLevel
} from '@/lib/recording/media-recorder';
import { queueRecording, startSyncLoop } from '@/lib/sync/sync-manager';
import { registerServiceWorker } from '@/lib/pwa/register-sw';
import { getCurrentUserId } from '@/lib/api/client';

type RecordingVisualState = 'idle' | 'recording-silent' | 'recording-speaking';

const SPEAKING_LEVEL_THRESHOLD = 0.08;

function RecordPageContent() {
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState('Ready');
  const [userId, setUserId] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const targetLevel = useRef(0);
  const frameHandle = useRef(0);

  useEffect(() => {
    registerServiceWorker();
    void getCurrentUserId().then(setUserId);
    const stop = startSyncLoop();

    const flushLevel = () => {
      frameHandle.current = 0;
      setLevel((current) => {
        const next = current + (targetLevel.current - current) * 0.35;
        if (Math.abs(next - targetLevel.current) > 0.005) {
          frameHandle.current = requestAnimationFrame(flushLevel);
        }
        return next;
      });
    };

    const unsubscribe = subscribeToRecordingLevel((nextLevel) => {
      targetLevel.current = nextLevel;
      if (!frameHandle.current) frameHandle.current = requestAnimationFrame(flushLevel);
    });

    return () => {
      stop();
      unsubscribe();
      if (frameHandle.current) cancelAnimationFrame(frameHandle.current);
      void cancelRecording();
    };
  }, []);

  const buttonText = useMemo(() => (recording ? 'Stop' : 'Record'), [recording]);
  const visualState = recording
    ? level > SPEAKING_LEVEL_THRESHOLD
      ? 'recording-speaking'
      : 'recording-silent'
    : 'idle';

  const scale = visualState === 'recording-speaking' ? 1 + Math.min(level, 0.5) * 0.25 : 1;
  const glow = visualState === 'recording-speaking' ? Math.round(level * 50) : 8;

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
    setRecording(false);
    if (!payload) return setStatus('No audio captured');
    if (!userId) return setStatus('Missing authenticated user. Please sign in again.');

    await queueRecording(userId, payload);
    setStatus(navigator.onLine ? 'Saved locally, uploading' : 'Saved locally, upload queued');
  }

  return (
    <main style={{ minHeight: '85vh', display: 'grid', placeItems: 'center' }}>
      <div style={{ textAlign: 'center', minWidth: 260 }}>
        <AuthControls />
        <button
          aria-label={`Recorder (${visualState})`}
          onClick={onTapRecord}
          style={{
            width: 180,
            height: 180,
            borderRadius: '50%',
            border: 'none',
            color: '#fff',
            fontSize: 24,
            cursor: 'pointer',
            transform: `scale(${scale})`,
            transition: 'background 120ms ease, transform 80ms linear, box-shadow 120ms ease',
            background: recording ? '#e74c3c' : '#111',
            boxShadow: `0 0 ${glow}px rgba(231, 76, 60, 0.65)`
          }}
        >
          {buttonText}
        </button>
        <p style={{ marginTop: 16, opacity: 0.8 }}>{status}</p>
        <p>
          <a href="/notes">View notes</a> · <a href="/settings">Settings</a>
        </p>
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
