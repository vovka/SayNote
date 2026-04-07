import test from 'node:test';
import assert from 'node:assert/strict';
import { parseClientCreatedAt } from './upload-created-at.ts';

test('parseClientCreatedAt rejects missing values', () => {
  assert.equal(parseClientCreatedAt(null), null);
  assert.equal(parseClientCreatedAt('' as FormDataEntryValue), null);
});

test('parseClientCreatedAt rejects invalid ISO-8601 values', () => {
  assert.equal(parseClientCreatedAt('2026-04-07 10:00:00' as FormDataEntryValue), null);
  assert.equal(parseClientCreatedAt('not-a-date' as FormDataEntryValue), null);
});

test('parseClientCreatedAt normalizes valid ISO-8601 values', () => {
  assert.equal(parseClientCreatedAt('2026-04-07T10:00:00-04:00' as FormDataEntryValue), '2026-04-07T14:00:00.000Z');
});
