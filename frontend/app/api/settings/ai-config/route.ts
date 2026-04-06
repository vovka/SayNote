import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId } from '@/lib/auth/session';
import { store } from '@/lib/api/in-memory-store';

const schema = z.object({
  primaryProvider: z.string().min(1),
  transcriptionModel: z.string().min(1),
  categorizationModel: z.string().min(1),
  fallbackProvider: z.string().optional(),
  fallbackTranscriptionModel: z.string().optional(),
  fallbackCategorizationModel: z.string().optional()
});

export async function PUT(request: Request) {
  const userId = await requireUserId();
  const payload = schema.parse(await request.json());
  store.setAIConfig(userId, payload);
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const userId = await requireUserId();
  return NextResponse.json(store.getAIConfig(userId));
}
