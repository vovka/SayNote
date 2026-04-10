const ISO_8601_WITH_TIMEZONE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+\-]\d{2}:\d{2})$/;

export function parseClientCreatedAt(raw: FormDataEntryValue | null): string | null {
  const value = String(raw ?? '').trim();
  if (!value || !ISO_8601_WITH_TIMEZONE.test(value)) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}
