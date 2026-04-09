'use client';

import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SettingsModal } from '@/components/settings-modal';
import { AuthGate } from '@/components/auth-gate';
import { AuthControls } from '@/components/auth-controls';
import { getCurrentUserId, getNotes, updateCategoryLock, type NoteCategoryTreeNode, type NoteSummary } from '@/lib/api/client';
import { db, type RecordingEntity } from '@/lib/db/indexeddb';
import {
  cancelRecording,
  startRecording,
  stopRecording,
  subscribeToRecordingLevel
} from '@/lib/recording/media-recorder';
import { getRecordingAnimationVars, getRecordingButtonStyle } from '@/lib/recording/recording-button-style';
import { getRecordingVisualState, getSmoothedLevel, type RecordingVisualState } from '@/lib/recording/recording-visual-state';
import { NoteHighlightTracker } from '@/lib/notes/new-note-highlights';
import { shouldRefreshNotesForProcessedTransition } from '@/lib/notes/refresh-policy';
import {
  buildSyncStatusItems,
  getSyncStageVisual,
  reconcileSyncItemsWithNotes,
  type SyncStatusItem
} from '@/lib/notes/sync-visibility';
import { sortCategoryTreeNewestFirst } from '@/lib/notes/tree-ordering';
import { registerServiceWorker } from '@/lib/pwa/register-sw';
import { queueRecording, startSyncLoop, SYNC_JOB_COMPLETED_EVENT } from '@/lib/sync/sync-manager';
import {
  isFrontendLifecycleStage,
  labelForLifecycleStage,
  lifecycleStageFromRecording,
  type FrontendLifecycleStage
} from '@/lib/lifecycle/frontend-lifecycle';

type CategoryNode = NoteCategoryTreeNode;
const RECORDING_STATUS_POLL_INTERVAL_MS = 1_000;

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function lifecycleStageFor(item: RecordingEntity): FrontendLifecycleStage {
  const stage = item.lifecycleStage;
  return isFrontendLifecycleStage(stage) ? stage : lifecycleStageFromRecording(item);
}

function retriesFor(item: RecordingEntity, stage: FrontendLifecycleStage): number {
  if (stage.startsWith('failed_upload')) return item.uploadRetryCount;
  if (stage.startsWith('failed_processing')) return item.processingRetryCount;
  return 0;
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

function CategoryTree({
  node,
  path = [],
  onToggleLock,
  highlightedNoteIds
}: {
  node: CategoryNode;
  path?: string[];
  onToggleLock: (node: CategoryNode) => void;
  highlightedNoteIds: Set<string>;
}) {
  const [isLockControlFocused, setLockControlFocused] = useState(false);
  const nextPath = [...path, node.name];
  const lockControlStyle: CSSProperties = useMemo(
    () => ({
      display: 'inline-flex',
      alignItems: 'center',
      borderRadius: 999,
      border: node.isLocked ? '1px solid #1f2937' : '1px solid #374151',
      backgroundColor: node.isLocked ? '#1f2937' : '#ffffff',
      color: node.isLocked ? '#f9fafb' : '#111827',
      padding: '4px 10px',
      fontWeight: 600,
      fontSize: 12,
      lineHeight: '16px',
      cursor: 'pointer',
      outline: '2px solid transparent',
      outlineOffset: 2,
      outlineColor: isLockControlFocused ? (node.isLocked ? '#93c5fd' : '#2563eb') : 'transparent'
    }),
    [isLockControlFocused, node.isLocked]
  );

  return (
    <section style={{ marginLeft: path.length * 16 }}>
      <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {node.name}
        <button
          type="button"
          aria-label={node.isLocked ? `Unlock category ${node.name}` : `Lock category ${node.name}`}
          title={node.isLocked ? `Locked category: ${node.name}` : `Unlocked category: ${node.name}`}
          style={lockControlStyle}
          onFocus={() => setLockControlFocused(true)}
          onBlur={() => setLockControlFocused(false)}
          onClick={() => onToggleLock(node)}
        >
          <span aria-hidden="true">{node.isLocked ? '🔐' : '🔓'}</span>
        </button>
      </h3>
      <ul>
        {node.notes.map((note) => {
          const isHighlighted = highlightedNoteIds.has(note.id);

          return (
            <li
              key={note.id}
              className={isHighlighted ? 'note-item--new' : undefined}
              style={isHighlighted ? { backgroundColor: '#fff7cc' } : undefined}
            >
              <p style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                <span>{note.text}</span>
                <small style={{ color: '#6b7280' }}>{new Date(note.createdAt).toLocaleString()}</small>
              </p>
            </li>
          );
        })}
      </ul>
      {node.children.map((child) => (
        <CategoryTree
          key={child.id}
          node={child}
          path={nextPath}
          onToggleLock={onToggleLock}
          highlightedNoteIds={highlightedNoteIds}
        />
      ))}
    </section>
  );
}

function updateNodeLock(nodes: CategoryNode[], categoryId: string, isLocked: boolean): CategoryNode[] {
  return nodes.map((node) => {
    if (node.id === categoryId) {
      return { ...node, isLocked };
    }

    return {
      ...node,
      children: updateNodeLock(node.children, categoryId, isLocked)
    };
  });
}

function flattenNotes(nodes: CategoryNode[]): NoteSummary[] {
  const flattened: NoteSummary[] = [];
  const stack = [...nodes];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    flattened.push(...current.notes);
    stack.push(...current.children);
  }
  return flattened;
}

function NotesPageContent() {
  const [trees, setTrees] = useState<CategoryNode[]>([]);
  const [syncItems, setSyncItems] = useState<SyncStatusItem[]>([]);
  const [highlightedNoteIds, setHighlightedNoteIds] = useState<Set<string>>(new Set());
  const [recording, setRecording] = useState(false);
  const [statusHint, setStatusHint] = useState('Ready');
  const [actionError, setActionError] = useState<string | null>(null);
  const [latestRecording, setLatestRecording] = useState<RecordingEntity | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const highlightTrackerRef = useRef(new NoteHighlightTracker());
  const previousStatusesRef = useRef<Map<string, RecordingEntity['status']>>(new Map());
  const targetLevel = useRef(0);
  const frameHandle = useRef(0);
  const previousVisualState = useRef<RecordingVisualState>('idle');
  const settingsButtonRef = useRef<HTMLButtonElement | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    registerServiceWorker();
    const stopSyncLoop = startSyncLoop();
    void getCurrentUserId().then(setUserId);

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
      unsubscribe();
      stopSyncLoop();
      if (frameHandle.current) cancelAnimationFrame(frameHandle.current);
      void cancelRecording();
    };
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const refreshLatestRecording = async () => {
      const userRecordings = await db.recordings.where('userId').equals(userId).sortBy('createdAt');
      const item = userRecordings.at(-1);
      if (cancelled) return;
      setLatestRecording(item ?? null);
    };

    void refreshLatestRecording();
    const timer = setInterval(() => void refreshLatestRecording(), RECORDING_STATUS_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [userId]);

  useEffect(() => {
    const refreshAll = async () => {
      const items = await db.recordings
        .orderBy('createdAt')
        .reverse()
        .limit(20)
        .toArray();

      const nextStatuses = new Map(items.map((item) => [item.id, item.status]));
      const hadNewProcessedItem = shouldRefreshNotesForProcessedTransition(previousStatusesRef.current, items);
      previousStatusesRef.current = nextStatuses;

      let nextTrees = await getNotes();
      if (hadNewProcessedItem) {
        nextTrees = await getNotes();
      }
      const sortedTrees = sortCategoryTreeNewestFirst(nextTrees);
      setHighlightedNoteIds(highlightTrackerRef.current.next(sortedTrees));
      setTrees(sortedTrees);
      setSyncItems(reconcileSyncItemsWithNotes(buildSyncStatusItems(items), flattenNotes(sortedTrees)));
    };

    void refreshAll();
    const timer = setInterval(() => {
      void refreshAll();
    }, 15_000);
    const onRefresh = () => {
      void refreshAll();
    };
    window.addEventListener('focus', onRefresh);
    window.addEventListener(SYNC_JOB_COMPLETED_EVENT, onRefresh);

    return () => {
      highlightTrackerRef.current.reset();
      clearInterval(timer);
      window.removeEventListener('focus', onRefresh);
      window.removeEventListener(SYNC_JOB_COMPLETED_EVENT, onRefresh);
    };
  }, []);

  const buttonText = useMemo(() => (recording ? 'Stop' : 'Record'), [recording]);
  const visualState = getRecordingVisualState(recording, level, previousVisualState.current);
  const buttonStyle = getRecordingButtonStyle(visualState, level);

  useEffect(() => {
    previousVisualState.current = visualState;
  }, [visualState]);

  const status = useMemo(() => {
    if (actionError) return actionError;
    if (recording) return 'Recording';
    if (latestRecording) return statusFromRecording(latestRecording);
    return statusHint;
  }, [actionError, latestRecording, recording, statusHint]);

  const handleToggleLock = async (node: CategoryNode) => {
    const nextLocked = !node.isLocked;
    setTrees((previous) => updateNodeLock(previous, node.id, nextLocked));

    try {
      await updateCategoryLock(node.id, nextLocked);
    } catch {
      setTrees((previous) => updateNodeLock(previous, node.id, node.isLocked));
    }
  };

  const onTapRecord = useCallback(async () => {
    if (!userId) {
      setActionError('Missing authenticated user. Please sign in again.');
      return;
    }

    if (!recording) {
      try {
        await startRecording();
        setActionError(null);
        setStatusHint(labelForLifecycleStage('recorded_local'));
        setRecording(true);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Microphone access denied or unavailable';
        setActionError(message);
      }
      return;
    }

    const payload = await stopRecording();
    setRecording(false);
    if (!payload) return setActionError('No audio captured');

    setActionError(null);
    await queueRecording(userId, payload);
  }, [recording, userId]);

  const isRecordingMode = visualState !== 'idle';
  const closeSettings = () => {
    setIsSettingsOpen(false);
    settingsButtonRef.current?.focus();
  };
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
  return (
    <main style={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <section style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 240px' }}>
        <AuthControls />
        <h1>Notes</h1>
        <section>
          <h2>Sync status</h2>
          <p><small>Only local pending and failed sync items render here. Processed notes render in the categorized list below.</small></p>
          {syncItems.length === 0 ? <p>No local sync activity yet.</p> : (
            <ul>
              {syncItems.map((item) => {
                const visual = getSyncStageVisual(item);
                const recordedAt = new Date(item.createdAt).toLocaleString();
                const liveText = `${item.label}. Recorded ${recordedAt}. ${visual.liveText}`;
                return (
                  <li key={item.id} style={{ marginBottom: 10 }} aria-busy={visual.isBusy}>
                    <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      {visual.showSpinner ? <span className="sync-spinner" aria-hidden /> : null}
                      {item.label}
                    </strong>
                    <span className="sync-status-live" role="status">
                      {liveText}
                    </span>
                    <div><small>Stage: {labelForLifecycleStage(lifecycleStageFromRecording(item), item.failedStage === 'upload' ? item.uploadRetryCount : item.processingRetryCount)}</small></div>
                    <div><small>Recorded: {new Date(item.createdAt).toLocaleString()}</small></div>
                    <div><small>Updated: {new Date(item.statusUpdatedAt).toLocaleString()}</small></div>
                    {item.nextUploadRetryAt ? <div><small>Next upload retry: {new Date(item.nextUploadRetryAt).toLocaleString()}</small></div> : null}
                    {item.nextProcessingRetryAt ? <div><small>Next processing check: {new Date(item.nextProcessingRetryAt).toLocaleString()}</small></div> : null}
                    {item.uploadCompletedAt ? <div><small>Uploaded: {new Date(item.uploadCompletedAt).toLocaleString()}</small></div> : null}
                    {item.processedAt ? <div><small>Processed: {new Date(item.processedAt).toLocaleString()}</small></div> : null}
                    {item.lastError ? <div><small>Error: {item.lastError}</small></div> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        {trees.map((node) => (
          <CategoryTree
            key={node.id}
            node={node}
            onToggleLock={handleToggleLock}
            highlightedNoteIds={highlightedNoteIds}
          />
        ))}
      </section>

      <section
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          borderTop: '1px solid #e5e7eb',
          background: 'rgba(255, 255, 255, 0.98)',
          backdropFilter: 'blur(8px)',
          padding: '12px 16px calc(env(safe-area-inset-bottom) + 12px)'
        }}
      >
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            aria-label={`Recorder (${visualState})`}
            onClick={onTapRecord}
            style={{
              position: 'relative',
              width: 88,
              height: 88,
              borderRadius: '50%',
              border: 'none',
              color: '#fff',
              fontSize: 18,
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
          <div>
            <strong>Quick recorder</strong>
            <p style={{ margin: '6px 0 0', opacity: 0.8 }}>{status}</p>
            <p style={{ margin: '6px 0 0' }}>
              <button
                ref={settingsButtonRef}
                type="button"
                onClick={() => setIsSettingsOpen(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  color: '#0070f3',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  fontSize: 'inherit',
                  fontFamily: 'inherit'
                }}
              >
                Settings
              </button>
            </p>
          </div>
        </div>
      </section>


      <SettingsModal isOpen={isSettingsOpen} onClose={closeSettings} />

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
        @keyframes sync-status-spin {
          to { transform: rotate(360deg); }
        }
        .sync-spinner {
          width: 0.8rem;
          height: 0.8rem;
          border: 2px solid #d1d5db;
          border-top-color: #111827;
          border-radius: 9999px;
          animation: sync-status-spin 0.8s linear infinite;
        }
        .sync-status-live {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }
        @media (prefers-reduced-motion: reduce) {
          .sync-spinner {
            animation: none;
            border-top-color: #6b7280;
          }
        }
      `}</style>
    </main>
  );
}

export default function NotesPage() {
  return (
    <AuthGate>
      <NotesPageContent />
    </AuthGate>
  );
}
