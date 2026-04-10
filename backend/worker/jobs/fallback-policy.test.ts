import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldTryFallback } from './fallback-policy.ts';

test('shouldTryFallback always uses fallback for retryable primary failures when fallback exists', () => {
  assert.equal(
    shouldTryFallback({
      failureKind: 'retryable',
      isPrimaryAttempt: true,
      hasFallback: true,
      fallbackOnTerminalPrimaryFailure: false
    }),
    true
  );
});

test('shouldTryFallback only uses fallback for terminal primary failures when explicit flag is enabled', () => {
  assert.equal(
    shouldTryFallback({
      failureKind: 'terminal',
      isPrimaryAttempt: true,
      hasFallback: true,
      fallbackOnTerminalPrimaryFailure: false
    }),
    false
  );

  assert.equal(
    shouldTryFallback({
      failureKind: 'terminal',
      isPrimaryAttempt: true,
      hasFallback: true,
      fallbackOnTerminalPrimaryFailure: true
    }),
    true
  );
});
