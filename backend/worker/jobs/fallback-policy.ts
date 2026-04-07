export function shouldTryFallback(input: {
  failureKind: 'retryable' | 'terminal';
  isPrimaryAttempt: boolean;
  hasFallback: boolean;
  fallbackOnTerminalPrimaryFailure: boolean;
}) {
  if (!input.hasFallback) {
    return false;
  }

  if (input.failureKind === 'retryable') {
    return true;
  }

  return input.isPrimaryAttempt && input.fallbackOnTerminalPrimaryFailure;
}
