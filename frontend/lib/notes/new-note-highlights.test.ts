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
  let time = 1000;
  const tracker = new NoteHighlightTracker({ durationMs: 5_000, now: () => time });

  assert.deepEqual(Array.from(tracker.next(tree(['a', 'b', 'c']))), []);
  time = 2000;
  assert.deepEqual(Array.from(tracker.next(tree(['a', 'b', 'd']))), ['d']);
});

test('highlight persists across back-to-back refreshes within duration window', () => {
  let time = 1000;
  const tracker = new NoteHighlightTracker({ durationMs: 5_000, now: () => time });

  tracker.next(tree(['a', 'b', 'c']));
  time = 2000;
  assert.deepEqual(Array.from(tracker.next(tree(['a', 'b', 'd']))), ['d']);
  time = 2100;
  assert.deepEqual(Array.from(tracker.next(tree(['a', 'b', 'd']))), ['d']);
  time = 3000;
  assert.deepEqual(Array.from(tracker.next(tree(['a', 'b', 'd']))), ['d']);
});

test('highlight expires after duration window', () => {
  let time = 1000;
  const tracker = new NoteHighlightTracker({ durationMs: 5_000, now: () => time });

  tracker.next(tree(['a', 'b', 'c']));
  time = 2000;
  assert.deepEqual(Array.from(tracker.next(tree(['a', 'b', 'd']))), ['d']);
  time = 7001;
  assert.deepEqual(Array.from(tracker.next(tree(['a', 'b', 'd']))), []);
});

test('already-highlighted notes do not flash again when they return later', () => {
  let time = 1000;
  const tracker = new NoteHighlightTracker({ durationMs: 5_000, now: () => time });

  tracker.next(tree(['a', 'b', 'c']));
  time = 2000;
  assert.deepEqual(Array.from(tracker.next(tree(['a', 'b', 'd']))), ['d']);
  time = 3000;
  assert.deepEqual(Array.from(tracker.next(tree(['a', 'b', 'e']))), ['d', 'e']);
  time = 10000;
  assert.deepEqual(Array.from(tracker.next(tree(['a', 'b', 'd']))), []);
});

test('highlight is removed after page leave and re-enter', () => {
  let time = 1000;
  const tracker = new NoteHighlightTracker({ durationMs: 5_000, now: () => time });

  tracker.next(tree(['a', 'b', 'c']));
  time = 2000;
  assert.deepEqual(Array.from(tracker.next(tree(['a', 'b', 'd']))), ['d']);

  tracker.reset();

  time = 3000;
  assert.deepEqual(Array.from(tracker.next(tree(['a', 'b', 'd']))), []);
});

test('default constructor works without options', () => {
  const tracker = new NoteHighlightTracker();

  assert.deepEqual(Array.from(tracker.next(tree(['a', 'b', 'c']))), []);
  assert.ok(tracker.next(tree(['a', 'b', 'd'])).has('d'));
});
