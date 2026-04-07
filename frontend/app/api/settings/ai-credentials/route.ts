import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId } from '@/lib/auth/session';
import { upsertCredential } from '@/lib/api/supabase-server';
import { mapErrorCode, scrubSensitiveFields } from '@/lib/api/safe-logging';

const ALLOWED_PROVIDERS = new Set(['groq', 'openrouter']);
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_UPDATES = 5;
const credentialUpdatesByUser = new Map<string, number[]>();

const schema = z.object({
  provider: z
    .string()
    .min(1)
    .transform((value) => value.trim().toLowerCase())
    .refine((value) => ALLOWED_PROVIDERS.has(value), { message: 'Unsupported provider' }),
  apiKey: z.string().min(8)
});

function checkUserRateLimit(userId: string) {
  const now = Date.now();
  const recent = (credentialUpdatesByUser.get(userId) ?? []).filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);

  if (recent.length >= RATE_LIMIT_MAX_UPDATES) {
    return { allowed: false as const, retryAfterSeconds: Math.ceil((RATE_LIMIT_WINDOW_MS - (now - recent[0])) / 1000) };
  }

  recent.push(now);
  credentialUpdatesByUser.set(userId, recent);
  return { allowed: true as const };
}

export async function PUT(request: Request) {
  try {
    const userId = await requireUserId(request);
    const limit = checkUserRateLimit(userId);
    if (!limit.allowed) {
      return NextResponse.json(
        { ok: false, errorCode: 'RATE_LIMITED', error: 'Too many credential update attempts. Please try again shortly.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      );
    }

    const payload = schema.parse(await request.json());

    await upsertCredential(userId, payload.provider, payload.apiKey);
    return NextResponse.json({ ok: true, provider: payload.provider, apiKeyStored: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ ok: false, errorCode: 'UNAUTHORIZED', error: 'Unauthorized' }, { status: 401 });
    }

    const errorCode = mapErrorCode(error);
    console.error(
      '[ai_credential_update_failed]',
      JSON.stringify({
        errorCode,
        safeDetails: scrubSensitiveFields(error)
      })
    );
    return NextResponse.json({ ok: false, errorCode, error: 'Invalid credential payload' }, { status: 400 });
  }
}
