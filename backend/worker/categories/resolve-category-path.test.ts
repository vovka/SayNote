import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCategoryPath, normalizeCategoryPathText } from './resolve-category-path.ts';

test('normalizeCategoryPath trims segments and collapses repeated whitespace', () => {
  assert.deepEqual(normalizeCategoryPath([' Inbox ', '', 'Kitchen   Appliances', '  ']), ['Inbox', 'Kitchen Appliances']);
});

test('normalizeCategoryPathText is case-insensitive and whitespace-insensitive', () => {
  assert.equal(normalizeCategoryPathText([' Home ', ' Kitchen   Appliances ']), 'home > kitchen appliances');
  assert.equal(normalizeCategoryPathText(['home', 'kitchen appliances']), 'home > kitchen appliances');
});
