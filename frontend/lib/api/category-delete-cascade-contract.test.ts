import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('category delete cascade contract covers nested categories and notes', async () => {
  const [schemaSource, routeSource, apiClientSource] = await Promise.all([
    readFile(new URL('../../../db/schema.sql', import.meta.url), 'utf8'),
    readFile(new URL('../../app/api/categories/[id]/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('./client.ts', import.meta.url), 'utf8')
  ]);

  assert.match(schemaSource, /parent_id uuid references categories\(id\) on delete cascade/);
  assert.match(schemaSource, /category_id uuid not null references categories\(id\) on delete cascade/);
  assert.match(routeSource, /const deleted = await deleteCategoryForUser\(userId, id\);/);
  assert.doesNotMatch(routeSource, /CATEGORY_HAS_DEPENDENCIES/);
  assert.doesNotMatch(apiClientSource, /CATEGORY_HAS_DEPENDENCIES/);
});
