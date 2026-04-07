export function logSanitizedApiError(context: string, error: unknown, metadata: Record<string, unknown> = {}) {
  const errorName = error instanceof Error ? error.name : typeof error;
  const hasStack = error instanceof Error ? Boolean(error.stack) : false;
  console.error(context, {
    ...metadata,
    errorName,
    hasStack
  });
}
