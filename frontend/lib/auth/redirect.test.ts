import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildAuthCallbackUrl, getSafeNextPath } from './redirect.ts';

test('getSafeNextPath keeps internal paths and rejects unsafe values', () => {
  assert.equal(getSafeNextPath('/notes'), '/notes');
  assert.equal(getSafeNextPath('/notes?view=recent'), '/notes?view=recent');
  assert.equal(getSafeNextPath('https://evil.example'), '/');
  assert.equal(getSafeNextPath('//evil.example'), '/');
  assert.equal(getSafeNextPath(null), '/');
});

test('buildAuthCallbackUrl preserves the safe next path', () => {
  const url = buildAuthCallbackUrl('http://localhost:3000', '/notes?view=recent');

  assert.equal(
    url,
    'http://localhost:3000/auth/callback?next=%2Fnotes%3Fview%3Drecent'
  );
});

test('pkce auth uses one explicit code exchange path', async () => {
  const browserSource = await readFile(new URL('../supabase/browser.ts', import.meta.url), 'utf8');
  const callbackSource = await readFile(
    new URL('../../app/auth/callback/auth-callback-client.tsx', import.meta.url),
    'utf8'
  );

  assert.match(browserSource, /detectSessionInUrl:\s*false/);
  assert.match(callbackSource, /exchangeCodeForSession\(code\)/);
});
