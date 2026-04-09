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
import { db, type RecordingEntity } from '@/lib/db/indexeddb';
import { queueRecording, startSyncLoop } from '@/lib/sync/sync-manager';
import { registerServiceWorker } from '@/lib/pwa/register-sw';
import { getCurrentUserId } from '@/lib/api/client';
import { getRecordingVisualState, getSmoothedLevel } from '@/lib/recording/recording-visual-state';
import {
  isFrontendLifecycleStage,
  labelForLifecycleStage,
  lifecycleStageFromRecording,
  type FrontendLifecycleStage
} from '@/lib/lifecycle/frontend-lifecycle';

const RECORDING_STATUS_POLL_INTERVAL_MS = 1_000;

function lifecycleStageFor(item: RecordingEntity): FrontendLifecycleStage {
  const stage = item.lifecycleStage;
  return isFrontendLifecycleStage(stage) ? stage : lifecycleStageFromRecording(item);
}

function retriesFor(item: RecordingEntity, stage: FrontendLifecycleStage): number {
  if (stage.startsWith('failed_upload')) return item.uploadRetryCount;
  if (stage.startsWith('failed_processing')) return item.processingRetryCount;
  return 0;
}

function latestRecordingFor(items: RecordingEntity[]): RecordingEntity | null {
  if (!items.length) return null;
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}

function failureStatusMessage(item: RecordingEntity, stage: FrontendLifecycleStage): string {
  const base = labelForLifecycleStage(stage, retriesFor(item, stage));
  const reason = item.lastError ? ` (${item.lastError})` : '';
  if (stage === 'failed_upload_terminal') return `${base}. Check your connection and record again.${reason}`;
  if (stage === 'failed_processing_terminal') return `${base}. Please record again in a moment.${reason}`;
  return `${base}${reason}`;
}

function statusFromRecording(item: RecordingEntity): string {
  const stage = lifecycleStageFor(item);
  if (stage.startsWith('failed_')) return failureStatusMessage(item, stage);
  if (stage === 'processed' || stage === 'note_visible') return 'Your note is ready';
  return labelForLifecycleStage(stage, retriesFor(item, stage));
}

function RecordPageContent() {
  const [recording, setRecording] = useState(false);
  const [statusHint, setStatusHint] = useState('Ready');
  const [actionError, setActionError] = useState<string | null>(null);
  const [latestRecording, setLatestRecording] = useState<RecordingEntity | null>(null);
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
        const { next, shouldContinue } = getSmoothedLevel(current, targetLevel.current);
        if (shouldContinue) frameHandle.current = requestAnimationFrame(flushLevel);
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

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const refreshLatestRecording = async () => {
      const items = await db.recordings.where('userId').equals(userId).toArray();
      if (cancelled) return;
      setLatestRecording(latestRecordingFor(items));
    };

    void refreshLatestRecording();
    const interval = setInterval(() => void refreshLatestRecording(), RECORDING_STATUS_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [userId]);

  const buttonText = useMemo(() => (recording ? 'Stop' : 'Record'), [recording]);
  const visualState = getRecordingVisualState(recording, level);

  const status = useMemo(() => {
    if (actionError) return actionError;
    if (recording) return 'Recording';
    if (latestRecording) return statusFromRecording(latestRecording);
    return statusHint;
  }, [actionError, latestRecording, recording, statusHint]);

  const scale = visualState === 'recording-speaking' ? 1 + Math.min(level, 0.5) * 0.25 : 1;
  const glow = visualState === 'recording-speaking' ? Math.round(level * 50) : 8;

  async function onTapRecord() {
    if (!recording) {
      try {
        await startRecording();
        setActionError(null);
        setStatusHint(labelForLifecycleStage('recorded_local'));
        setRecording(true);
      } catch {
        setActionError('Microphone access denied or unavailable');
      }
      return;
    }

    const payload = await stopRecording();
    setRecording(false);
    if (!payload) return setActionError('No audio captured');
    if (!userId) return setActionError('Missing authenticated user. Please sign in again.');

    setActionError(null);
    await queueRecording(userId, payload);
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
