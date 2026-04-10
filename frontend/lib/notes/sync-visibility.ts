import type { RecordingEntity } from '@/lib/db/indexeddb';
import {
  labelForLifecycleStage,
  lifecycleStageFromRecording,
  type FrontendLifecycleStage
} from '../lifecycle/frontend-lifecycle.ts';

export type SyncTransientStatus = 'note_added_success';

export interface SyncStatusItem extends RecordingEntity {
  label: string;
  transientStatus?: SyncTransientStatus;
  sourceJobId?: string;
  clientRecordingId?: string;
}

export interface NoteSyncMetadata {
  sourceJobId?: string;
  clientRecordingId?: string;
}

export interface SyncStageVisual {
  isBusy: boolean;
  liveText: string;
  showSpinner: boolean;
  stage: FrontendLifecycleStage;
}

export function buildSyncStatusItems(items: RecordingEntity[]): SyncStatusItem[] {
  return items
    .filter((item) => item.status !== 'processed')
    .sort(compareNewestFirst)
    .map((item) => ({ ...item, label: renderSyncStatus(item) }));
}

export function getSyncStageVisual(item: RecordingEntity | SyncStatusItem): SyncStageVisual {
  if ('transientStatus' in item && item.transientStatus === 'note_added_success') {
    return { stage: 'note_visible', showSpinner: false, isBusy: false, liveText: 'Note added successfully.' };
  }
  const stage = lifecycleStageFromRecording(item);
  const retries = item.failedStage === 'upload' ? item.uploadRetryCount : item.processingRetryCount;
  const stageLabel = labelForLifecycleStage(stage, retries);
  if (isInFlightStage(stage)) {
    const retryingSuffix = stage.includes('retryable') ? '. Retrying.' : '. In progress.';
    return { stage, showSpinner: true, isBusy: true, liveText: `${stageLabel}${retryingSuffix}` };
  }
  return { stage, showSpinner: false, isBusy: false, liveText: `${stageLabel}.` };
}

export function reconcileSyncItemsWithNotes(syncItems: SyncStatusItem[], notes: NoteSyncMetadata[]): SyncStatusItem[] {
  const correlatedClientIds = new Set(notes.map((note) => note.clientRecordingId).filter((value): value is string => Boolean(value)));
  const correlatedJobIds = new Set(notes.map((note) => note.sourceJobId).filter((value): value is string => Boolean(value)));
  return syncItems.map((item) => toVisibleStatusItem(item, correlatedClientIds, correlatedJobIds));
}

export function renderSyncStatus(item: RecordingEntity): string {
  const stage = lifecycleStageFromRecording(item);
  const retries = item.failedStage === 'upload' ? item.uploadRetryCount : item.processingRetryCount;
  return labelForLifecycleStage(stage, retries);
}

function toVisibleStatusItem(item: SyncStatusItem, correlatedClientIds: Set<string>, correlatedJobIds: Set<string>): SyncStatusItem {
  if (!isCorrelatedPendingProcessing(item, correlatedClientIds, correlatedJobIds)) return item;
  return {
    ...item,
    label: 'Note added',
    transientStatus: 'note_added_success',
    clientRecordingId: item.id,
    sourceJobId: item.serverJobId
  };
}

function compareNewestFirst(a: RecordingEntity, b: RecordingEntity): number {
  const createdAtDiff = Date.parse(b.createdAt) - Date.parse(a.createdAt);
  if (createdAtDiff !== 0) return createdAtDiff;
  return b.id.localeCompare(a.id);
}

function isCorrelatedPendingProcessing(item: SyncStatusItem, correlatedClientIds: Set<string>, correlatedJobIds: Set<string>): boolean {
  if (item.status !== 'uploaded_waiting_processing') return false;
  if (correlatedClientIds.has(item.id)) return true;
  if (!item.serverJobId) return false;
  return correlatedJobIds.has(item.serverJobId);
}

function isInFlightStage(stage: FrontendLifecycleStage): boolean {
  return stage === 'uploading' || stage === 'uploaded_waiting_processing' || stage === 'transcribing' || stage === 'failed_upload_retryable' || stage === 'failed_processing_retryable';
}
