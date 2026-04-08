import test from 'node:test';
import assert from 'node:assert/strict';
import type { PoolClient } from 'pg';
import {
  normalizeCategoryPath,
  normalizeCategoryPathText,
  resolveCategoryPath,
  resolveCategorySelection
} from './resolve-category-path.ts';

function createMockClient(rowsByQuery: Array<Array<Record<string, string>>>) {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const client = {
    async query(sql: string, params: unknown[] = []) {
      queries.push({ sql, params });
      return { rowCount: rowsByQuery[0]?.length ?? 0, rows: rowsByQuery.shift() ?? [] };
    }
  } as Pick<PoolClient, 'query'> as PoolClient;

  return { client, queries };
}

test('normalizeCategoryPath trims segments and collapses repeated whitespace', () => {
  assert.deepEqual(normalizeCategoryPath([' Inbox ', '', 'Kitchen   Appliances', '  ']), ['Inbox', 'Kitchen Appliances']);
});

test('normalizeCategoryPathText is case-insensitive and whitespace-insensitive', () => {
  assert.equal(normalizeCategoryPathText([' Home ', ' Kitchen   Appliances ']), 'home > kitchen appliances');
  assert.equal(normalizeCategoryPathText(['home', 'kitchen appliances']), 'home > kitchen appliances');
});

test('resolveCategoryPath returns an existing category for the normalized path', async () => {
  const { client, queries } = createMockClient([[{ id: 'existing-category' }]]);

  const categoryId = await resolveCategoryPath(client, 'user-1', [' Home ', ' Kitchen ']);

  assert.equal(categoryId, 'existing-category');
  assert.equal(queries.length, 1);
  assert.deepEqual(queries[0]?.params, ['user-1', 'home > kitchen']);
});

test('resolveCategoryPath upserts each normalized segment and returns the leaf id', async () => {
  const { client, queries } = createMockClient([
    [],
    [{ id: 'root-id', name: 'Home' }],
    [{ id: 'leaf-id', name: 'Kitchen Appliances' }]
  ]);

  const categoryId = await resolveCategoryPath(client, 'user-1', [' Home ', 'Kitchen   Appliances']);

  assert.equal(categoryId, 'leaf-id');
  assert.equal(queries.length, 3);
  assert.deepEqual(queries[1]?.params, ['user-1', null, 'Home', 'home', 'Home', 'home']);
  assert.deepEqual(queries[2]?.params, [
    'user-1',
    'root-id',
    'Kitchen Appliances',
    'kitchen appliances',
    'Home > Kitchen Appliances',
    'home > kitchen appliances'
  ]);
});

test('resolveCategorySelection validates selectedCategoryId for the user', async () => {
  const { client, queries } = createMockClient([[{ id: 'category-1' }]]);

  const categoryId = await resolveCategorySelection(client, {
    userId: 'user-1',
    selectedCategoryId: 'category-1'
  });

  assert.equal(categoryId, 'category-1');
  assert.equal(queries.length, 1);
  assert.deepEqual(queries[0]?.params, ['category-1', 'user-1']);
});

test('resolveCategorySelection rejects unknown selectedCategoryId values', async () => {
  const { client } = createMockClient([[]]);

  await assert.rejects(
    resolveCategorySelection(client, {
      userId: 'user-1',
      selectedCategoryId: 'missing-category'
    }),
    /Selected category id was not found for user/
  );
});
