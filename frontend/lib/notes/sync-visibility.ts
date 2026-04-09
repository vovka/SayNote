import type { RecordingEntity } from '@/lib/db/indexeddb';
import { labelForLifecycleStage, lifecycleStageFromRecording } from '@/lib/lifecycle/frontend-lifecycle';

export interface SyncStatusItem extends RecordingEntity {
  label: string;
}

export interface NoteSyncMetadata {
  sourceJobId?: string;
  clientRecordingId?: string;
}

export function buildSyncStatusItems(items: RecordingEntity[]): SyncStatusItem[] {
  return items
    .filter((item) => item.status !== 'processed')
    .sort(compareNewestFirst)
    .map((item) => ({ ...item, label: renderSyncStatus(item) }));
}

export function reconcileSyncItemsWithNotes(syncItems: SyncStatusItem[], notes: NoteSyncMetadata[]): SyncStatusItem[] {
  const correlatedClientIds = new Set(
    notes
      .map((note) => note.clientRecordingId)
      .filter((value): value is string => Boolean(value))
  );
  const correlatedJobIds = new Set(
    notes
      .map((note) => note.sourceJobId)
      .filter((value): value is string => Boolean(value))
  );

  return syncItems.filter((item) => !isCorrelatedPendingProcessing(item, correlatedClientIds, correlatedJobIds));
}

export function renderSyncStatus(item: RecordingEntity): string {
  const stage = lifecycleStageFromRecording(item);
  const retries = item.failedStage === 'upload' ? item.uploadRetryCount : item.processingRetryCount;
  return labelForLifecycleStage(stage, retries);
}

function compareNewestFirst(a: RecordingEntity, b: RecordingEntity): number {
  const createdAtDiff = Date.parse(b.createdAt) - Date.parse(a.createdAt);
  if (createdAtDiff !== 0) return createdAtDiff;
  return b.id.localeCompare(a.id);
}

function isCorrelatedPendingProcessing(
  item: SyncStatusItem,
  correlatedClientIds: Set<string>,
  correlatedJobIds: Set<string>
): boolean {
  if (item.status !== 'uploaded_waiting_processing') return false;
  if (correlatedClientIds.has(item.id)) return true;
  if (!item.serverJobId) return false;
  return correlatedJobIds.has(item.serverJobId);
}
