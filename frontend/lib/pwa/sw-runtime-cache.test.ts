import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('service worker bypasses runtime caching for authenticated API requests', async () => {
  const source = await readFile(new URL('../../public/sw.js', import.meta.url), 'utf8');

  assert.match(source, /requestUrl\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(source, /request\.headers\.has\('authorization'\)/);
  assert.match(source, /if \(shouldBypassRuntimeCache\(request, requestUrl\)\) \{\s*return fetch\(request\);/);
});
