import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId } from '@/lib/auth/session';
import { upsertCredential } from '@/lib/api/supabase-server';

const schema = z.object({
  provider: z.string().min(1),
  apiKey: z.string().min(8)
});

export async function PUT(request: Request) {
  try {
    const userId = await requireUserId();
    const payload = schema.parse(await request.json());

    await upsertCredential(userId, payload.provider, payload.apiKey);
    return NextResponse.json({ ok: true, provider: payload.provider, apiKeyStored: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('AI credential update failed', error);
    return NextResponse.json({ error: 'Invalid credential payload' }, { status: 400 });
  }
}
