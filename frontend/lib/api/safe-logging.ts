const SENSITIVE_KEYS = new Set(['apikey', 'api_key', 'authorization', 'token', 'secret', 'password', 'x-api-key']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function scrubError(error: Error) {
  const cause = 'cause' in error ? scrubSensitiveFields(error.cause) : undefined;
  return {
    ...Object.fromEntries(Object.entries(error).map(([key, value]) => [key, scrubSensitiveFields(value)])),
    name: error.name,
    message: error.message,
    stack: error.stack,
    ...(cause === undefined ? {} : { cause })
  };
}

export function scrubSensitiveFields(value: unknown): unknown {
  if (value instanceof Error) {
    return scrubError(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => scrubSensitiveFields(entry));
  }

  if (!isRecord(value)) {
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
