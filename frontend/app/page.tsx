'use client';

import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  getRecordingVisualState,
  getSmoothedLevel,
  type RecordingVisualState
} from '@/lib/recording/recording-visual-state';
import { getRecordingAnimationVars, getRecordingButtonStyle } from '@/lib/recording/recording-button-style';
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

function round(value: number): number {
  return Math.round(value * 100) / 100;
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
  const previousVisualState = useRef<RecordingVisualState>('idle');

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
  const visualState = getRecordingVisualState(recording, level, previousVisualState.current);
  previousVisualState.current = visualState;
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
  const primaryRingScale = 1 + buttonStyle.ringSpread / 100;
  const secondaryRingScale = 1 + buttonStyle.ringSpread / 70;
  const primaryAnimationVars = getRecordingAnimationVars(visualState, buttonStyle, primaryRingScale);
  const secondaryAnimationVars = getRecordingAnimationVars(visualState, buttonStyle, secondaryRingScale);
  const buttonAnimationVars = {
    '--pulse-saturation-base': buttonStyle.saturation,
    '--pulse-saturation-peak': primaryAnimationVars.pulseSaturationPeak,
    '--pulse-brightness-base': buttonStyle.brightness,
    '--pulse-brightness-peak': primaryAnimationVars.pulseBrightnessPeak
  } as CSSProperties;

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
            overflow: 'visible',
            ...buttonAnimationVars
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
                  transform: `scale(${primaryAnimationVars.ringScaleBase})`,
                  boxShadow: `0 0 ${buttonStyle.glowRadius}px rgba(231, 76, 60, ${buttonStyle.glowOpacity})`,
                  animation: `${ringAnimation} ${buttonStyle.pulseDurationMs}ms ease-in-out infinite`,
                  pointerEvents: 'none',
                  '--ring-scale-base': primaryAnimationVars.ringScaleBase,
                  '--ring-scale-peak': primaryAnimationVars.ringScalePeak,
                  '--ring-opacity-base': primaryAnimationVars.ringOpacityBase,
                  '--ring-opacity-peak': primaryAnimationVars.ringOpacityPeak
                } as CSSProperties}
              />
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: '50%',
                  border: '2px solid rgba(255, 176, 167, 0.45)',
                  opacity: buttonStyle.ringOpacity * 0.72,
                  transform: `scale(${secondaryAnimationVars.ringScaleBase})`,
                  boxShadow: `0 0 ${Math.round(buttonStyle.glowRadius * 0.8)}px rgba(231, 76, 60, ${buttonStyle.glowOpacity})`,
                  animation: `${ringAnimation} ${Math.round(buttonStyle.pulseDurationMs * 1.1)}ms ease-in-out infinite`,
                  pointerEvents: 'none',
                  '--ring-scale-base': secondaryAnimationVars.ringScaleBase,
                  '--ring-scale-peak': secondaryAnimationVars.ringScalePeak,
                  '--ring-opacity-base': round(buttonStyle.ringOpacity * 0.72),
                  '--ring-opacity-peak': round(primaryAnimationVars.ringOpacityPeak * 0.78)
                } as CSSProperties}
              />
            </>
          ) : null}
          {buttonText}
        </button>
        <style jsx>{`
          @keyframes recorder-pulse-slow {
            0%, 100% { filter: saturate(var(--pulse-saturation-base)) brightness(var(--pulse-brightness-base)); }
            50% { filter: saturate(var(--pulse-saturation-peak)) brightness(var(--pulse-brightness-peak)); }
          }
          @keyframes recorder-pulse-fast {
            0%, 100% { filter: saturate(var(--pulse-saturation-base)) brightness(var(--pulse-brightness-base)); }
            50% { filter: saturate(var(--pulse-saturation-peak)) brightness(var(--pulse-brightness-peak)); }
          }
          @keyframes recorder-ring-slow {
            0%, 100% { opacity: var(--ring-opacity-base); transform: scale(var(--ring-scale-base)); }
            50% { opacity: var(--ring-opacity-peak); transform: scale(var(--ring-scale-peak)); }
          }
          @keyframes recorder-ring-fast {
            0%, 100% { opacity: var(--ring-opacity-base); transform: scale(var(--ring-scale-base)); }
            50% { opacity: var(--ring-opacity-peak); transform: scale(var(--ring-scale-peak)); }
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
