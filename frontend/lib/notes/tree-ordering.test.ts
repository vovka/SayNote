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

test('sortCategoryTreeNewestFirst sorts root categories by latest activity', () => {
  const sorted = sortCategoryTreeNewestFirst([
    {
      id: 'old-root',
      notes: [{ id: 'old-note', createdAt: '2026-04-07T08:00:00.000Z' }],
      children: []
    },
    {
      id: 'new-root',
      notes: [{ id: 'new-note', createdAt: '2026-04-08T12:00:00.000Z' }],
      children: []
    },
    {
      id: 'mid-root',
      notes: [{ id: 'mid-note', createdAt: '2026-04-07T16:00:00.000Z' }],
      children: []
    }
  ]);

  assert.deepEqual(sorted.map((node) => node.id), ['new-root', 'mid-root', 'old-root']);
});

test('sortCategoryTreeNewestFirst sorts root categories by descendant activity', () => {
  const sorted = sortCategoryTreeNewestFirst([
    {
      id: 'root-with-old-note',
      notes: [{ id: 'old', createdAt: '2026-04-07T08:00:00.000Z' }],
      children: []
    },
    {
      id: 'root-with-deep-new-note',
      notes: [],
      children: [
        {
          id: 'child',
          notes: [{ id: 'deep-new', createdAt: '2026-04-09T10:00:00.000Z' }],
          children: []
        }
      ]
    }
  ]);

  assert.deepEqual(sorted.map((node) => node.id), ['root-with-deep-new-note', 'root-with-old-note']);
});

test('sortCategoryTreeNewestFirst handles empty categories without NaN sorting issues', () => {
  const sorted = sortCategoryTreeNewestFirst([
    { id: 'empty-b', notes: [], children: [] },
    { id: 'empty-a', notes: [], children: [] },
    { id: 'has-note', notes: [{ id: 'n1', createdAt: '2026-04-07T10:00:00.000Z' }], children: [] }
  ]);

  assert.equal(sorted[0]?.id, 'has-note');
  assert.deepEqual(sorted.slice(1).map((n) => n.id), ['empty-a', 'empty-b']);
});

test('sortCategoryTreeNewestFirst sorts children by latest descendant activity', () => {
  const sorted = sortCategoryTreeNewestFirst([
    {
      id: 'root',
      notes: [],
      children: [
        {
          id: 'older-child',
          notes: [{ id: 'older-note', createdAt: '2026-04-07T12:00:00.000Z' }],
          children: []
        },
        {
          id: 'descendant-newest-child',
          notes: [],
          children: [
            {
              id: 'grandchild',
              notes: [{ id: 'grandchild-note', createdAt: '2026-04-08T09:00:00.000Z' }],
              children: []
            }
          ]
        },
        {
          id: 'same-activity-a',
          notes: [{ id: 'same-a', createdAt: '2026-04-07T15:00:00.000Z' }],
          children: []
        },
        {
          id: 'same-activity-b',
          notes: [{ id: 'same-b', createdAt: '2026-04-07T15:00:00.000Z' }],
          children: []
        }
      ]
    }
  ]);

  assert.deepEqual(sorted[0]?.children.map((child) => child.id), [
    'descendant-newest-child',
    'same-activity-a',
    'same-activity-b',
    'older-child'
  ]);
});
