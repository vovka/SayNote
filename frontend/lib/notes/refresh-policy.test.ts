import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldRefreshNotesForProcessedTransition } from './refresh-policy.ts';

test('shouldRefreshNotesForProcessedTransition is true when any item transitions to processed', () => {
  const previous = new Map([
    ['a', 'uploaded_waiting_processing'],
    ['b', 'processed']
  ]);

  const shouldRefresh = shouldRefreshNotesForProcessedTransition(previous, [
    { id: 'a', status: 'processed' },
    { id: 'b', status: 'processed' }
  ]);

  assert.equal(shouldRefresh, true);
});

test('shouldRefreshNotesForProcessedTransition is false when no new processed transition occurs', () => {
  const previous = new Map([
    ['a', 'processed'],
    ['b', 'failed_retryable']
  ]);

  const shouldRefresh = shouldRefreshNotesForProcessedTransition(previous, [
    { id: 'a', status: 'processed' },
    { id: 'b', status: 'failed_retryable' }
  ]);

  assert.equal(shouldRefresh, false);
});
