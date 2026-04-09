'use client';

import { useEffect, useRef, useState } from 'react';
import { AuthGate } from '@/components/auth-gate';
import { AuthControls } from '@/components/auth-controls';
import { getNotes, updateCategoryLock, type NoteCategoryTreeNode, type NoteSummary } from '@/lib/api/client';
import { db, type RecordingEntity } from '@/lib/db/indexeddb';
import { NoteHighlightTracker } from '@/lib/notes/new-note-highlights';
import { shouldRefreshNotesForProcessedTransition } from '@/lib/notes/refresh-policy';
import { buildSyncStatusItems, reconcileSyncItemsWithNotes, type SyncStatusItem } from '@/lib/notes/sync-visibility';
import { sortCategoryTreeNewestFirst } from '@/lib/notes/tree-ordering';
import { SYNC_JOB_COMPLETED_EVENT } from '@/lib/sync/sync-manager';

type CategoryNode = NoteCategoryTreeNode;

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
  const nextPath = [...path, node.name];
  return (
    <section style={{ marginLeft: path.length * 16 }}>
      <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {node.name}
        <button
          type="button"
          aria-label={node.isLocked ? `Unlock category ${node.name}` : `Lock category ${node.name}`}
          onClick={() => onToggleLock(node)}
        >
          {node.isLocked ? '🔒' : '🔓'}
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
              <p>{note.text}</p>
              <small>{new Date(note.createdAt).toLocaleString()} · {nextPath.join(' > ')}</small>
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
  const highlightTrackerRef = useRef(new NoteHighlightTracker());
  const previousStatusesRef = useRef<Map<string, RecordingEntity['status']>>(new Map());

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

  const handleToggleLock = async (node: CategoryNode) => {
    const nextLocked = !node.isLocked;
    setTrees((previous) => updateNodeLock(previous, node.id, nextLocked));

    try {
      await updateCategoryLock(node.id, nextLocked);
    } catch {
      setTrees((previous) => updateNodeLock(previous, node.id, node.isLocked));
    }
  };

  return (
    <main>
      <AuthControls />
      <h1>Notes</h1>
      <section>
        <h2>Sync status</h2>
        <p><small>Only local pending and failed sync items render here. Processed notes render in the categorized list below.</small></p>
        {syncItems.length === 0 ? <p>No local sync activity yet.</p> : (
          <ul>
            {syncItems.map((item) => (
              <li key={item.id} style={{ marginBottom: 10 }}>
                <strong>{item.label}</strong>
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
      {trees.map((node) => (
        <CategoryTree
          key={node.id}
          node={node}
          onToggleLock={handleToggleLock}
          highlightedNoteIds={highlightedNoteIds}
        />
      ))}
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
