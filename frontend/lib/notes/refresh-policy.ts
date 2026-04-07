export interface NoteSyncItem {
  id: string;
  status: 'recorded_local' | 'queued_upload' | 'uploading' | 'uploaded_waiting_processing' | 'processed' | 'failed_retryable' | 'failed_terminal';
}

export function shouldRefreshNotesForProcessedTransition(
  previousStatuses: Map<string, NoteSyncItem['status']>,
  nextItems: NoteSyncItem[]
) {
  return nextItems.some((item) => item.status === 'processed' && previousStatuses.get(item.id) !== 'processed');
}
