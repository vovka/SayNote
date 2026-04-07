import test from 'node:test';
import assert from 'node:assert/strict';
import { sortCategoryTreeNewestFirst } from './tree-ordering.ts';

test('sortCategoryTreeNewestFirst sorts notes newest-first recursively', () => {
  const sorted = sortCategoryTreeNewestFirst([
    {
      id: 'root',
      notes: [
        { id: 'n1', createdAt: '2026-04-07T10:00:00.000Z' },
        { id: 'n3', createdAt: '2026-04-07T12:00:00.000Z' },
        { id: 'n2', createdAt: '2026-04-07T11:00:00.000Z' }
      ],
      children: [
        {
          id: 'child',
          notes: [
            { id: 'c1', createdAt: '2026-04-07T09:00:00.000Z' },
            { id: 'c2', createdAt: '2026-04-07T09:30:00.000Z' }
          ],
          children: []
        }
      ]
    }
  ]);

  assert.deepEqual(sorted[0]?.notes.map((note) => note.id), ['n3', 'n2', 'n1']);
  assert.deepEqual(sorted[0]?.children[0]?.notes.map((note) => note.id), ['c2', 'c1']);
});


test('sortCategoryTreeNewestFirst falls back to note id ordering for same createdAt timestamp', () => {
  const sorted = sortCategoryTreeNewestFirst([
    {
      id: 'root',
      notes: [
        { id: 'note-b', createdAt: '2026-04-07T12:00:00.000Z' },
        { id: 'note-a', createdAt: '2026-04-07T12:00:00.000Z' }
      ],
      children: []
    }
  ]);

  assert.deepEqual(sorted[0]?.notes.map((note) => note.id), ['note-b', 'note-a']);
});
