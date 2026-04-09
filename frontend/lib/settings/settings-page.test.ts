import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('settings modal keeps provider key inputs write-only', async () => {
  const source = await readFile(new URL('../../components/settings-modal.tsx', import.meta.url), 'utf8');

  assert.match(source, /<p>\{buildCredentialStatusCopy\(provider, providersWithKey\)\}<\/p>/);
  assert.match(source, /type="password"/);
  assert.doesNotMatch(source, /value=\{providersWithKey/);
  assert.doesNotMatch(source, /apiKey\s*:\s*config/);
});
