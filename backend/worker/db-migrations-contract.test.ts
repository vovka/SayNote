import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('repo exposes db bootstrap and migration commands backed by schema_migrations', async () => {
  const [rootPackageSource, backendPackageSource, runnerSource] = await Promise.all([
    readFile(new URL('../../package.json', import.meta.url), 'utf8'),
    readFile(new URL('../package.json', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/db.sh', import.meta.url), 'utf8')
  ]);

  const rootPackage = JSON.parse(rootPackageSource) as { scripts: Record<string, string> };
  const backendPackage = JSON.parse(backendPackageSource) as { scripts: Record<string, string> };

  assert.equal(rootPackage.scripts['db:bootstrap'], 'npm run -w backend db:bootstrap');
  assert.equal(rootPackage.scripts['db:migrate'], 'npm run -w backend db:migrate');
  assert.equal(rootPackage.scripts['db:migrate:status'], 'npm run -w backend db:migrate:status');
  assert.equal(backendPackage.scripts['db:bootstrap'], 'sh scripts/db.sh bootstrap');
  assert.equal(backendPackage.scripts['db:migrate'], 'sh scripts/db.sh migrate');
  assert.equal(backendPackage.scripts['db:migrate:status'], 'sh scripts/db.sh status');
  assert.match(runnerSource, /schema_migrations/);
  assert.match(runnerSource, /DATABASE_URL/);
  assert.match(runnerSource, /MIGRATIONS_DIR/);
});

test('incremental migrations include user review cursors used by the worker', async () => {
  const migrationSource = await readFile(
    new URL('../../db/migrations/20260408_add_user_review_cursors.sql', import.meta.url),
    'utf8'
  );

  assert.match(migrationSource, /create table if not exists user_review_cursors/i);
  assert.match(migrationSource, /enable row level security/i);
  assert.match(migrationSource, /users_manage_own_review_cursor/);
});


test('incremental migrations enforce cascade deletes from categories to notes', async () => {
  const migrationSource = await readFile(
    new URL('../../db/migrations/20260410_notes_category_delete_cascade.sql', import.meta.url),
    'utf8'
  );

  assert.match(migrationSource, /drop constraint if exists notes_category_id_fkey/i);
  assert.match(migrationSource, /add constraint notes_category_id_fkey/i);
  assert.match(migrationSource, /references categories\(id\)/i);
  assert.match(migrationSource, /on delete cascade/i);
});
