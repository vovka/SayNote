import assert from 'node:assert/strict';
import test from 'node:test';
import { NoteHighlightTracker, collectNoteIds } from './new-note-highlights';

function tree(ids: string[]) {
  return [
    {
      notes: [{ id: ids[0] }],
      children: [
        {
          notes: [{ id: ids[1] }],
          children: []
        }
      ]
    },
    {
      notes: [{ id: ids[2] }],
      children: []
    }
  ];
}

test('collectNoteIds keeps deterministic nested note order', () => {
  assert.deepEqual(collectNoteIds(tree(['a', 'b', 'c'])), ['a', 'b', 'c']);
});

test('note gets highlighted on first appearance after baseline refresh', () => {
  const tracker = new NoteHighlightTracker();

  assert.deepEqual(Array.from(tracker.next(tree(['a', 'b', 'c']))), []);
  assert.deepEqual(Array.from(tracker.next(tree(['a', 'b', 'd']))), ['d']);
});

test('highlight persists across back-to-back refreshes with no new notes', () => {
  const tracker = new NoteHighlightTracker();

  tracker.next(tree(['a', 'b', 'c']));
  assert.deepEqual(Array.from(tracker.next(tree(['a', 'b', 'd']))), ['d']);
  assert.deepEqual(Array.from(tracker.next(tree(['a', 'b', 'd']))), ['d']);
  assert.deepEqual(Array.from(tracker.next(tree(['a', 'b', 'd']))), ['d']);
});

test('highlight is replaced when a newer note arrives', () => {
  const tracker = new NoteHighlightTracker();

  tracker.next(tree(['a', 'b', 'c']));
  assert.deepEqual(Array.from(tracker.next(tree(['a', 'b', 'd']))), ['d']);

  // new note 'e' replaces 'd' as the highlighted note
  assert.deepEqual(Array.from(tracker.next(tree(['a', 'b', 'e']))), ['e']);
  assert.deepEqual(Array.from(tracker.next(tree(['a', 'b', 'e']))), ['e']);
});

test('already-highlighted notes do not flash again when they return later', () => {
  const tracker = new NoteHighlightTracker();

  tracker.next(tree(['a', 'b', 'c']));
  assert.deepEqual(Array.from(tracker.next(tree(['a', 'b', 'd']))), ['d']);

  // 'e' replaces 'd'
  assert.deepEqual(Array.from(tracker.next(tree(['a', 'b', 'e']))), ['e']);

  // 'd' comes back — should not re-highlight
  assert.deepEqual(Array.from(tracker.next(tree(['a', 'b', 'd']))), ['e']);
});

test('highlight is removed after page leave and re-enter', () => {
  const tracker = new NoteHighlightTracker();

  tracker.next(tree(['a', 'b', 'c']));
  assert.deepEqual(Array.from(tracker.next(tree(['a', 'b', 'd']))), ['d']);

  tracker.reset();

  assert.deepEqual(Array.from(tracker.next(tree(['a', 'b', 'd']))), []);
});

test('default constructor works without options', () => {
  const tracker = new NoteHighlightTracker();

  assert.deepEqual(Array.from(tracker.next(tree(['a', 'b', 'c']))), []);
  assert.ok(tracker.next(tree(['a', 'b', 'd'])).has('d'));
});
