const SENSITIVE_KEYS = new Set(['apikey', 'api_key', 'authorization', 'token', 'secret', 'password', 'x-api-key']);

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function scrubSensitiveFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => scrubSensitiveFields(entry));
  }

  if (!isObjectLike(value)) {
    return value;
  }

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      output[key] = '[REDACTED]';
      continue;
    }

    output[key] = scrubSensitiveFields(entry);
  }

  return output;
}

export function toSafeErrorMetadata(error: unknown): { name?: string; message: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: String(scrubSensitiveFields(error.message))
    };
  }

  return {
    message: JSON.stringify(scrubSensitiveFields(error))
  };
}

export function logWorkerFailure(input: {
  jobId: string;
  userId: string;
  provider?: string;
  errorCode: string;
  error: unknown;
}) {
  const safeMeta = toSafeErrorMetadata(input.error);
  console.error(
    '[worker_job_failed]',
    JSON.stringify({
      jobId: input.jobId,
      userId: input.userId,
      provider: input.provider ?? null,
      errorCode: input.errorCode,
      errorName: safeMeta.name ?? null,
      errorMessage: safeMeta.message
    })
  );
}
