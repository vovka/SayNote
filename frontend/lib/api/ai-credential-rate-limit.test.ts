import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('credential updates use a database-backed rate limit instead of in-memory process state', async () => {
  const routeSource = await readFile(new URL('../../app/api/settings/ai-credentials/route.ts', import.meta.url), 'utf8');
  const serverSource = await readFile(new URL('./supabase-server.ts', import.meta.url), 'utf8');
  const schemaSource = await readFile(new URL('../../../db/schema.sql', import.meta.url), 'utf8');

  assert.match(routeSource, /await checkCredentialUpdateRateLimit\(userId\)/);
  assert.doesNotMatch(routeSource, /new Map<string, number\[\]>\(\)/);
  assert.match(serverSource, /from\('ai_credential_update_attempts'\)/);
  assert.match(serverSource, /insert\(\{ user_id: userId \}\)/);
  assert.match(schemaSource, /create table if not exists ai_credential_update_attempts/);
  assert.match(schemaSource, /ai_credential_update_attempts_user_id_created_at_idx/);
});
