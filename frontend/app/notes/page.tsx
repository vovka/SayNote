'use client';

import { useEffect, useRef, useState } from 'react';
import { AuthGate } from '@/components/auth-gate';
import { AuthControls } from '@/components/auth-controls';
import { getNotes } from '@/lib/api/client';
import { db, type RecordingEntity } from '@/lib/db/indexeddb';
import { SYNC_JOB_COMPLETED_EVENT } from '@/lib/sync/sync-manager';

interface CategoryNode {
  id: string;
  name: string;
  notes: { id: string; text: string; createdAt: string; status?: string }[];
  children: CategoryNode[];
}

function CategoryTree({ node, path = [] }: { node: CategoryNode; path?: string[] }) {
  const nextPath = [...path, node.name];
  return (
    <section style={{ marginLeft: path.length * 16 }}>
      <h3>{node.name}</h3>
      <ul>
        {node.notes.map((note) => (
          <li key={note.id}>
            <p>{note.text}</p>
            <small>{new Date(note.createdAt).toLocaleString()} · {nextPath.join(' > ')}</small>
          </li>
        ))}
      </ul>
      {node.children.map((child) => <CategoryTree key={child.id} node={child} path={nextPath} />)}
    </section>
  );
}

function NotesPageContent() {
  const [trees, setTrees] = useState<CategoryNode[]>([]);
  const [syncItems, setSyncItems] = useState<RecordingEntity[]>([]);
  const previousStatusesRef = useRef<Map<string, RecordingEntity['status']>>(new Map());

  useEffect(() => {
    const refreshNotes = async () => {
      const nextTrees = await getNotes();
      setTrees(nextTrees);
    };

    const refreshSyncItems = async () => {
      const items = await db.recordings
        .orderBy('createdAt')
        .reverse()
        .limit(20)
        .toArray();

      const nextStatuses = new Map(items.map((item) => [item.id, item.status]));
      const hadNewProcessedItem = items.some((item) => {
        const previousStatus = previousStatusesRef.current.get(item.id);
        return item.status === 'processed' && previousStatus !== 'processed';
      });
      previousStatusesRef.current = nextStatuses;
      setSyncItems(items);

      if (hadNewProcessedItem) {
        await refreshNotes();
      }
    };

    const refreshAll = () => {
      void refreshSyncItems();
      void refreshNotes();
    };

    void refreshAll();
    const timer = setInterval(() => {
      void refreshSyncItems();
      void refreshNotes();
    }, 15_000);
    window.addEventListener('focus', refreshAll);
    window.addEventListener(SYNC_JOB_COMPLETED_EVENT, refreshAll);

    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refreshAll);
      window.removeEventListener(SYNC_JOB_COMPLETED_EVENT, refreshAll);
    };
  }, []);

  return (
    <main>
      <AuthControls />
      <h1>Notes</h1>
      <section>
        <h2>Sync status</h2>
        <p><small>Failed uploads or processing attempts remain visible here until they succeed or expire.</small></p>
        {syncItems.length === 0 ? <p>No local sync activity yet.</p> : (
          <ul>
            {syncItems.map((item) => (
              <li key={item.id} style={{ marginBottom: 10 }}>
                <strong>{renderStatus(item)}</strong>
                <div><small>Recorded: {new Date(item.createdAt).toLocaleString()}</small></div>
                <div><small>Updated: {new Date(item.statusUpdatedAt).toLocaleString()}</small></div>
                {item.nextUploadRetryAt ? <div><small>Next upload retry: {new Date(item.nextUploadRetryAt).toLocaleString()}</small></div> : null}
                {item.nextProcessingRetryAt ? <div><small>Next processing check: {new Date(item.nextProcessingRetryAt).toLocaleString()}</small></div> : null}
                {item.uploadCompletedAt ? <div><small>Uploaded: {new Date(item.uploadCompletedAt).toLocaleString()}</small></div> : null}
                {item.processedAt ? <div><small>Processed: {new Date(item.processedAt).toLocaleString()}</small></div> : null}
                {item.lastError ? <div><small>Error: {item.lastError}</small></div> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
      {trees.map((node) => <CategoryTree key={node.id} node={node} />)}
    </main>
  );
}

function renderStatus(item: RecordingEntity) {
  if (item.status === 'uploaded_waiting_processing') return 'Pending processing';
  if (item.status === 'failed_retryable' && item.failedStage === 'upload') return `Upload failed (retry ${item.uploadRetryCount})`;
  if (item.status === 'failed_retryable' && item.failedStage === 'processing') return `Processing failed (retry ${item.processingRetryCount})`;
  if (item.status === 'failed_terminal' && item.failedStage === 'upload') return 'Upload failed permanently';
  if (item.status === 'failed_terminal' && item.failedStage === 'processing') return 'Processing failed permanently';
  if (item.status === 'processed') return 'Processed';
  if (item.status === 'uploading') return 'Uploading';
  if (item.status === 'queued_upload') return 'Queued for upload';
  return item.status;
}

export default function NotesPage() {
  return (
    <AuthGate>
      <NotesPageContent />
    </AuthGate>
  );
}
