const SENSITIVE_KEYS = new Set(['apikey', 'api_key', 'authorization', 'token', 'secret', 'password', 'x-api-key']);

export function scrubSensitiveFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => scrubSensitiveFields(entry));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const next: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      next[key] = '[REDACTED]';
    } else {
      next[key] = scrubSensitiveFields(nested);
    }
  }

  return next;
}

export function mapErrorCode(error: unknown) {
  if (error instanceof Error && error.message === 'Unauthorized') {
    return 'UNAUTHORIZED';
  }

  return 'INVALID_CREDENTIAL_PAYLOAD';
}
