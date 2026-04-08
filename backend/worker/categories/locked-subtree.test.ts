import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLockedSubtreeSet, isCategoryInLockedSubtree } from './locked-subtree.ts';

test('buildLockedSubtreeSet includes locked categories and all descendants', () => {
  const lockedSet = buildLockedSubtreeSet([
    { id: 'a', parent_id: null, is_locked: false },
    { id: 'b', parent_id: 'a', is_locked: true },
    { id: 'c', parent_id: 'b', is_locked: false },
    { id: 'd', parent_id: null, is_locked: false }
  ]);

  assert.equal(isCategoryInLockedSubtree('b', lockedSet), true);
  assert.equal(isCategoryInLockedSubtree('c', lockedSet), true);
  assert.equal(isCategoryInLockedSubtree('a', lockedSet), false);
  assert.equal(isCategoryInLockedSubtree('d', lockedSet), false);
});
