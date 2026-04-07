import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('upload route requires/validates createdAt and persists normalized client timestamp', async () => {
  const routeSource = await readFile(new URL('../../app/api/audio/upload/route.ts', import.meta.url), 'utf8');
  const storageSource = await readFile(new URL('./supabase-server.ts', import.meta.url), 'utf8');

  assert.match(routeSource, /const clientCreatedAt = parseClientCreatedAt\(formData\.get\('createdAt'\)\)/);
  assert.match(routeSource, /if \(!clientCreatedAt\) \{\s*return invalidPayload\('Missing or invalid createdAt \(must be ISO-8601 with timezone\)'\);\s*\}/);
  assert.match(routeSource, /clientCreatedAt,\s*audioStorageKey: storageKey/s);
  assert.match(routeSource, /client_created_at: job\.clientCreatedAt/);

  assert.match(storageSource, /client_created_at: input\.clientCreatedAt/);
  assert.match(storageSource, /clientCreatedAt: data\.client_created_at as string/);
});
