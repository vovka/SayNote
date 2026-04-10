import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('schema enforces normalized sibling uniqueness, lock state columns, and user-scoped indexes', async () => {
  const source = await readFile(new URL('../../db/schema.sql', import.meta.url), 'utf8');

  assert.match(source, /normalized_name text not null/);
  assert.match(source, /normalized_path_cache text not null/);
  assert.match(source, /is_locked boolean not null default false/);
  assert.match(source, /categories_user_parent_normalized_name_unique_idx/);
  assert.match(source, /nulls not distinct/);
  assert.match(source, /create index if not exists categories_user_id_idx on categories \(user_id\);/);
  assert.match(source, /create index if not exists processing_jobs_user_id_idx on processing_jobs \(user_id\);/);
  assert.match(source, /create index if not exists notes_user_id_idx on notes \(user_id\);/);
  assert.match(source, /category_id uuid not null references categories\(id\) on delete cascade/);
});
