interface TreeNote {
  id: string;
}

interface TreeNode {
  notes: TreeNote[];
  children: TreeNode[];
}

function collectNoteIds(nodes: TreeNode[]): string[] {
  return nodes.flatMap((node) => {
    const childIds = collectNoteIds(node.children);
    return [...node.notes.map((note) => note.id), ...childIds];
  });
}

function toNewIds(currentIds: string[], previousIds: Set<string>, seenIds: Set<string>): Set<string> {
  const next = new Set<string>();
  currentIds.forEach((id) => {
    if (previousIds.has(id) || seenIds.has(id)) {
      return;
    }

    next.add(id);
    seenIds.add(id);
  });
  return next;
}

export class NoteHighlightTracker {
  private previousIds = new Set<string>();

  private seenIds = new Set<string>();

  next(nodes: TreeNode[]): Set<string> {
    const currentIds = collectNoteIds(nodes);

    if (this.previousIds.size === 0) {
      this.previousIds = new Set(currentIds);
      return new Set();
    }

    const nextIds = toNewIds(currentIds, this.previousIds, this.seenIds);
    this.previousIds = new Set(currentIds);
    return nextIds;
  }

  reset() {
    this.previousIds = new Set();
    this.seenIds = new Set();
  }
}

export { collectNoteIds };
