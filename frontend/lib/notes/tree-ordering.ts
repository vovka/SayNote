export interface NoteListNode {
  id: string;
  notes: { id: string; createdAt: string }[];
  children: NoteListNode[];
}

export function sortCategoryTreeNewestFirst<T extends NoteListNode>(nodes: T[]): T[] {
  return nodes.map(sortNodeNewestFirst);
}

function sortNodeNewestFirst<T extends NoteListNode>(node: T): T {
  const sortedNotes = [...node.notes].sort((a, b) => {
    const createdAtDiff = Date.parse(b.createdAt) - Date.parse(a.createdAt);
    if (createdAtDiff !== 0) return createdAtDiff;
    return b.id.localeCompare(a.id);
  });

  const sortedChildren = node.children.map(sortNodeNewestFirst);
  return {
    ...node,
    notes: sortedNotes,
    children: sortedChildren
  };
}
