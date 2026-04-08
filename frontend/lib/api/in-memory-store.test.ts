import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('in-memory store uses a composite key map for category path lookups', async () => {
  const source = await readFile(new URL('./in-memory-store.ts', import.meta.url), 'utf8');

  assert.match(source, /const categoriesByPath = new Map<string, string>\(\);/);
  assert.match(source, /categoriesByPath\.get\(buildCategoryLookupKey\(userId, parentId, segment\)\)/);
  assert.match(source, /categoriesByPath\.set\(buildCategoryLookupKey\(userId, parentId, segment\), id\);/);
  assert.doesNotMatch(source, /Array\.from\(categories\.values\(\)\)\.find/);
});
