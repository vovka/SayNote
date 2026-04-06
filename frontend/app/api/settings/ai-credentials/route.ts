import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId } from '@/lib/auth/session';
import { encryptSecret } from '@/../backend/worker/security/encryption';
import { store } from '@/lib/api/in-memory-store';

const schema = z.object({
  provider: z.string().min(1),
  apiKey: z.string().min(8)
});

export async function PUT(request: Request) {
  const userId = await requireUserId();
  const payload = schema.parse(await request.json());

  await encryptSecret(payload.apiKey);
  store.setCredential(userId, payload.provider);
  return NextResponse.json({ ok: true, provider: payload.provider, apiKeyStored: true });
}
