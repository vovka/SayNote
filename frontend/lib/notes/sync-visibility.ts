import type { RecordingEntity } from '@/lib/db/indexeddb';

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
  if (item.status === 'recorded_local' || item.status === 'queued_upload') return 'Pending upload';
  if (item.status === 'uploaded_waiting_processing') return 'Pending processing';
  if (item.status === 'failed_retryable' && item.failedStage === 'upload') return `Upload failed (retry ${item.uploadRetryCount})`;
  if (item.status === 'failed_retryable' && item.failedStage === 'processing') return `Processing failed (retry ${item.processingRetryCount})`;
  if (item.status === 'failed_terminal' && item.failedStage === 'upload') return 'Upload failed permanently';
  if (item.status === 'failed_terminal' && item.failedStage === 'processing') return 'Processing failed permanently';
  if (item.status === 'uploading') return 'Uploading';
  return item.status;
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
