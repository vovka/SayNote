export function getSafeNextPath(next: string | null | undefined) {
  if (!next || !next.startsWith('/') || next.startsWith('//')) {
    return '/';
  }

  return next;
}

export function buildAuthCallbackUrl(origin: string, next: string | null | undefined) {
  const url = new URL('/auth/callback', origin);
  url.searchParams.set('next', getSafeNextPath(next));
  return url.toString();
}
