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
import { getRecordingButtonStyle } from '@/lib/recording/recording-button-style';
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
  const buttonStyle = getRecordingButtonStyle(visualState, level);

  const status = useMemo(() => {
    if (actionError) return actionError;
    if (recording) return 'Recording';
    if (latestRecording) return statusFromRecording(latestRecording);
    return statusHint;
  }, [actionError, latestRecording, recording, statusHint]);
  const isRecordingMode = visualState !== 'idle';
  const pulseAnimation = visualState === 'recording-speaking' ? 'recorder-pulse-fast' : 'recorder-pulse-slow';
  const ringAnimation = visualState === 'recording-speaking' ? 'recorder-ring-fast' : 'recorder-ring-slow';
  const ringTransform = `scale(${1 + buttonStyle.ringSpread / 100})`;

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
            position: 'relative',
            width: 180,
            height: 180,
            borderRadius: '50%',
            border: 'none',
            color: '#fff',
            fontSize: 24,
            cursor: 'pointer',
            transform: `scale(${buttonStyle.scale})`,
            transition: 'background 120ms ease, transform 80ms linear, box-shadow 120ms ease',
            background: recording ? '#e74c3c' : '#111',
            boxShadow: `0 0 ${buttonStyle.glowRadius}px rgba(231, 76, 60, ${buttonStyle.glowOpacity})`,
            filter: `saturate(${buttonStyle.saturation}) brightness(${buttonStyle.brightness})`,
            animation: isRecordingMode ? `${pulseAnimation} ${buttonStyle.pulseDurationMs}ms ease-in-out infinite` : undefined,
            overflow: 'visible'
          }}
        >
          {isRecordingMode ? (
            <>
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: '50%',
                  border: '2px solid rgba(255, 132, 118, 0.5)',
                  opacity: buttonStyle.ringOpacity,
                  transform: ringTransform,
                  boxShadow: `0 0 ${buttonStyle.glowRadius}px rgba(231, 76, 60, ${buttonStyle.glowOpacity})`,
                  animation: `${ringAnimation} ${buttonStyle.pulseDurationMs}ms ease-in-out infinite`,
                  pointerEvents: 'none'
                }}
              />
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: '50%',
                  border: '2px solid rgba(255, 176, 167, 0.45)',
                  opacity: buttonStyle.ringOpacity * 0.72,
                  transform: `scale(${1 + buttonStyle.ringSpread / 70})`,
                  boxShadow: `0 0 ${Math.round(buttonStyle.glowRadius * 0.8)}px rgba(231, 76, 60, ${buttonStyle.glowOpacity})`,
                  animation: `${ringAnimation} ${Math.round(buttonStyle.pulseDurationMs * 1.1)}ms ease-in-out infinite`,
                  pointerEvents: 'none'
                }}
              />
            </>
          ) : null}
          {buttonText}
        </button>
        <style jsx>{`
          @keyframes recorder-pulse-slow {
            0%, 100% { filter: saturate(1.08) brightness(1.02); }
            50% { filter: saturate(1.2) brightness(1.12); }
          }
          @keyframes recorder-pulse-fast {
            0%, 100% { filter: saturate(1.2) brightness(1.08); }
            50% { filter: saturate(1.45) brightness(1.22); }
          }
          @keyframes recorder-ring-slow {
            0%, 100% { opacity: 0.34; transform: scale(1.06); }
            50% { opacity: 0.52; transform: scale(1.18); }
          }
          @keyframes recorder-ring-fast {
            0%, 100% { opacity: 0.42; transform: scale(1.1); }
            50% { opacity: 0.72; transform: scale(1.34); }
          }
        `}</style>
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
