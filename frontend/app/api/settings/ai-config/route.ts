import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId } from '@/lib/auth/session';
import { getAIConfig, upsertAIConfig } from '@/lib/api/supabase-server';

const schema = z.object({
  primaryProvider: z.string().min(1),
  transcriptionModel: z.string().min(1),
  categorizationModel: z.string().min(1),
  fallbackProvider: z.string().optional(),
  fallbackTranscriptionModel: z.string().optional(),
  fallbackCategorizationModel: z.string().optional()
});

export async function PUT(request: Request) {
  try {
    const userId = await requireUserId();
    const payload = schema.parse(await request.json());
    await upsertAIConfig(userId, payload);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('AI config update failed', error);
    return NextResponse.json({ error: 'Invalid config payload' }, { status: 400 });
  }
}

export async function GET() {
  try {
    const userId = await requireUserId();
    return NextResponse.json(await getAIConfig(userId));
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('AI config fetch failed', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
