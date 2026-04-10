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

  private highlightedAt = new Map<string, number>();

  private readonly durationMs: number;

  private readonly now: () => number;

  constructor(options?: { durationMs?: number; now?: () => number }) {
    this.durationMs = options?.durationMs ?? 5_000;
    this.now = options?.now ?? Date.now;
  }

  next(nodes: TreeNode[]): Set<string> {
    const currentIds = collectNoteIds(nodes);
    const currentTime = this.now();

    if (this.previousIds.size === 0) {
      this.previousIds = new Set(currentIds);
      return new Set();
    }

    const newIds = toNewIds(currentIds, this.previousIds, this.seenIds);
    this.previousIds = new Set(currentIds);

    for (const id of newIds) {
      this.highlightedAt.set(id, currentTime);
    }

    const active = new Set<string>();
    for (const [id, startTime] of this.highlightedAt) {
      if (currentTime - startTime < this.durationMs) {
        active.add(id);
      } else {
        this.highlightedAt.delete(id);
      }
    }
    return active;
  }

  reset() {
    this.previousIds = new Set();
    this.seenIds = new Set();
    this.highlightedAt = new Map();
  }
}

export { collectNoteIds };
