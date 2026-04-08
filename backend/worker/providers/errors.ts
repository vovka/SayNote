export type ProviderFailureKind = 'retryable' | 'terminal';

export interface ProviderErrorOptions {
  provider: string;
  operation: 'transcribe' | 'categorizeWithReview';
  kind: ProviderFailureKind;
  code: string;
  safeMessage: string;
  status?: number;
  cause?: unknown;
}

export class ProviderError extends Error {
  readonly provider: string;
  readonly operation: 'transcribe' | 'categorizeWithReview';
  readonly kind: ProviderFailureKind;
  readonly code: string;
  readonly safeMessage: string;
  readonly status?: number;

  constructor(options: ProviderErrorOptions) {
    super(options.safeMessage);
    this.name = 'ProviderError';
    this.provider = options.provider;
    this.operation = options.operation;
    this.kind = options.kind;
    this.code = options.code;
    this.safeMessage = options.safeMessage;
    this.status = options.status;
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export function isProviderError(error: unknown): error is ProviderError {
  return error instanceof ProviderError;
}

function normalizeSnippet(value: unknown) {
  if (typeof value !== 'string') return undefined;
  return value.replace(/[\r\n\t]+/g, ' ').slice(0, 180);
}

export function classifyHttpStatus(status: number): ProviderFailureKind {
  if (status === 408 || status === 409 || status === 425 || status === 429 || status >= 500) {
    return 'retryable';
  }
  return 'terminal';
}

export function safeErrorMessage(error: unknown) {
  if (error instanceof ProviderError) {
    return error.safeMessage;
  }

  if (error instanceof Error) {
    return normalizeSnippet(error.message) ?? 'Unknown processing error';
  }

  return 'Unknown processing error';
}

export function mapHttpFailure(input: {
  provider: string;
  operation: 'transcribe' | 'categorizeWithReview';
  status: number;
  body: unknown;
}) {
  const snippet = normalizeSnippet(
    typeof input.body === 'string'
      ? input.body
      : input.body && typeof input.body === 'object'
        ? (input.body as Record<string, unknown>).error
        : undefined
  );

  return new ProviderError({
    provider: input.provider,
    operation: input.operation,
    status: input.status,
    code: `HTTP_${input.status}`,
    kind: classifyHttpStatus(input.status),
    safeMessage: snippet
      ? `${input.provider} ${input.operation} failed (${input.status}): ${snippet}`
      : `${input.provider} ${input.operation} failed with HTTP ${input.status}`
  });
}

export function mapNetworkFailure(input: {
  provider: string;
  operation: 'transcribe' | 'categorizeWithReview';
  error: unknown;
}) {
  return new ProviderError({
    provider: input.provider,
    operation: input.operation,
    kind: 'retryable',
    code: 'NETWORK_FAILURE',
    safeMessage: `${input.provider} ${input.operation} network failure`,
    cause: input.error
  });
}

export function mapInvalidResponse(input: {
  provider: string;
  operation: 'transcribe' | 'categorizeWithReview';
  reason: string;
}) {
  return new ProviderError({
    provider: input.provider,
    operation: input.operation,
    kind: 'terminal',
    code: 'INVALID_PROVIDER_RESPONSE',
    safeMessage: `${input.provider} ${input.operation} invalid response: ${input.reason}`
  });
}
