export interface NoteListNode {
  id: string;
  notes: { id: string; createdAt: string }[];
  children: NoteListNode[];
}

export function sortCategoryTreeNewestFirst<T extends NoteListNode>(nodes: T[]): T[] {
  return nodes.map(sortNodeNewestFirst);
}

function sortNodeNewestFirst<T extends NoteListNode>(node: T): T {
  return { ...node, notes: sortNotesNewestFirst(node.notes), children: sortChildrenByActivity(node.children) };
}

function sortChildrenByActivity<T extends NoteListNode>(children: T[]): T[] {
  const childEntries = children.map((child, index) => createChildEntry(sortNodeNewestFirst(child), index));
  childEntries.sort(compareByLatestActivity);
  return childEntries.map((entry) => entry.child);
}

function compareByLatestActivity<T extends NoteListNode>(
  left: { index: number; child: T; activity: number },
  right: { index: number; child: T; activity: number }
): number {
  const activityDiff = right.activity - left.activity;
  if (activityDiff !== 0) return activityDiff;
  const idDiff = left.child.id.localeCompare(right.child.id);
  if (idDiff !== 0) return idDiff;
  return left.index - right.index;
}

function getLatestActivityTimestamp(node: NoteListNode): number {
  const ownLatest = getLatestNoteTimestamp(node.notes);
  const childLatest = node.children.reduce(maxChildActivity, Number.NEGATIVE_INFINITY);
  return Math.max(ownLatest, childLatest);
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

function maxChildActivity(latest: number, child: NoteListNode): number {
  return Math.max(latest, getLatestActivityTimestamp(child));
}

function maxNoteTimestamp(latest: number, note: { createdAt: string }): number {
  return Math.max(latest, Date.parse(note.createdAt));
}

function createChildEntry<T extends NoteListNode>(child: T, index: number) {
  return { index, child, activity: getLatestActivityTimestamp(child) };
}
