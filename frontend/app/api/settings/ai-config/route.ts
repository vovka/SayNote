import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId } from '@/lib/auth/session';
import { getAIConfig, upsertAIConfig } from '@/lib/api/supabase-server';
import { validateAIProviderConfig } from '@/../shared/types/model-policy';

const schema = z.object({
  primaryProvider: z.string().min(1),
  transcriptionModel: z.string().min(1),
  categorizationModel: z.string().min(1),
  fallbackProvider: z.string().optional(),
  fallbackTranscriptionModel: z.string().optional(),
  fallbackCategorizationModel: z.string().optional(),
  fallbackOnTerminalPrimaryFailure: z.boolean().optional()
});

export async function PUT(request: Request) {
  try {
    const userId = await requireUserId(request);
    const payload = schema.parse(await request.json());
    const validated = validateAIProviderConfig(payload);
    if (!validated.ok) {
      return NextResponse.json(
        { error: validated.error.message, errorCode: validated.error.code, provider: validated.error.provider },
        { status: 400 }
      );
    }
    await upsertAIConfig(userId, validated.value);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('AI config update failed', error);
    return NextResponse.json({ error: 'Invalid config payload' }, { status: 400 });
  }
}

export async function GET(request: Request) {
  try {
    const userId = await requireUserId(request);
    return NextResponse.json(await getAIConfig(userId));
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('AI config fetch failed', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
