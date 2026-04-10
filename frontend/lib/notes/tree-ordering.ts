export interface NoteListNode {
  id: string;
  notes: { id: string; createdAt: string }[];
  children: NoteListNode[];
}

type SortedNodeResult<T extends NoteListNode> = {
  node: T;
  activity: number;
};

export function sortCategoryTreeNewestFirst<T extends NoteListNode>(nodes: T[]): T[] {
  return nodes.map((node) => sortNodeWithActivity(node).node);
}

function sortNodeWithActivity<T extends NoteListNode>(node: T): SortedNodeResult<T> {
  const childEntries = node.children.map((child, index) => sortChildWithIndex(child, index));
  childEntries.sort(compareByLatestActivity);
  const sortedNode = {
    ...node,
    notes: sortNotesNewestFirst(node.notes),
    children: childEntries.map((entry) => entry.node)
  };
  const ownActivity = getLatestNoteTimestamp(sortedNode.notes);
  const childActivity = childEntries.reduce(maxChildEntryActivity, Number.NEGATIVE_INFINITY);
  return { node: sortedNode, activity: Math.max(ownActivity, childActivity) };
}

function sortChildWithIndex<T extends NoteListNode>(child: T, index: number) {
  return { ...sortNodeWithActivity(child), index };
}

function compareByLatestActivity<T extends NoteListNode>(
  left: SortedNodeResult<T> & { index: number },
  right: SortedNodeResult<T> & { index: number }
): number {
  const activityDiff = right.activity - left.activity;
  if (activityDiff !== 0) return activityDiff;
  const idDiff = left.node.id.localeCompare(right.node.id);
  if (idDiff !== 0) return idDiff;
  return left.index - right.index;
}

function getLatestNoteTimestamp(notes: { createdAt: string }[]): number {
  return notes.reduce(maxNoteTimestamp, Number.NEGATIVE_INFINITY);
}

function sortNotesNewestFirst(notes: { id: string; createdAt: string }[]) {
  return [...notes].sort(compareNotesNewestFirst);
}

function compareNotesNewestFirst(
  left: { id: string; createdAt: string },
  right: { id: string; createdAt: string }
): number {
  const createdAtDiff = Date.parse(right.createdAt) - Date.parse(left.createdAt);
  if (createdAtDiff !== 0) return createdAtDiff;
  return right.id.localeCompare(left.id);
}

function maxNoteTimestamp(latest: number, note: { createdAt: string }): number {
  return Math.max(latest, Date.parse(note.createdAt));
}

function maxChildEntryActivity<T extends NoteListNode>(
  latest: number,
  childEntry: SortedNodeResult<T> & { index: number }
): number {
  return Math.max(latest, childEntry.activity);
}
