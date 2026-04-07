import test from 'node:test';
import assert from 'node:assert/strict';
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
