import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId } from '@/lib/auth/session';
import { getAIConfig, upsertAIConfig } from '@/lib/api/supabase-server';
import { scrubSensitiveFields } from '@/lib/api/safe-logging';
import { validateAIProviderConfig } from '@/../shared/types/model-policy';

const transcriptionPreferencesSchema = z.object({
  transcriptionMode: z.enum(['standard_batch', 'live_azure']),
  liveTranscriptionLanguage: z.string().min(2)
});

const schema = z.object({
  primaryProvider: z.string().min(1),
  transcriptionModel: z.string().min(1),
  categorizationModel: z.string().min(1),
  fallbackProvider: z.string().optional(),
  fallbackTranscriptionModel: z.string().optional(),
  fallbackCategorizationModel: z.string().optional(),
  fallbackOnTerminalPrimaryFailure: z.boolean().optional(),
  transcriptionPreferences: transcriptionPreferencesSchema.optional()
});

export async function PUT(request: Request) {
  try {
    const userId = await requireUserId(request);
    const rawPayload = await request.json();
    const payload = schema.parse(rawPayload);
    const validated = validateAIProviderConfig(payload);
    if (!validated.ok) {
      return NextResponse.json(
        {
          error: 'Invalid AI config payload',
          errorCode: validated.error.code,
          provider: validated.error.provider
        },
        { status: 400 }
      );
    }
    await upsertAIConfig(userId, validated.value, payload.transcriptionPreferences);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', errorCode: 'UNAUTHORIZED' }, { status: 401 });
    }
    if (error instanceof SyntaxError) {
      console.error(
        '[ai_config_parse_failed]',
        JSON.stringify({ errorCode: 'INVALID_JSON_PAYLOAD', safeDetails: scrubSensitiveFields(error) })
      );
      return NextResponse.json({ error: 'Invalid AI config payload', errorCode: 'INVALID_JSON_PAYLOAD' }, { status: 400 });
    }
    if (error instanceof z.ZodError) {
      console.error(
        '[ai_config_validation_failed]',
        JSON.stringify({ errorCode: 'INVALID_AI_CONFIG_PAYLOAD', safeDetails: scrubSensitiveFields(error.flatten()) })
      );
      return NextResponse.json({ error: 'Invalid AI config payload', errorCode: 'INVALID_AI_CONFIG_PAYLOAD' }, { status: 400 });
    }
    console.error(
      '[ai_config_update_failed]',
      JSON.stringify({ errorCode: 'AI_CONFIG_UPDATE_FAILED', safeDetails: scrubSensitiveFields(error) })
    );
    return NextResponse.json({ error: 'Internal server error', errorCode: 'AI_CONFIG_UPDATE_FAILED' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const userId = await requireUserId(request);
    return NextResponse.json(await getAIConfig(userId));
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', errorCode: 'UNAUTHORIZED' }, { status: 401 });
    }
    console.error(
      '[ai_config_fetch_failed]',
      JSON.stringify({ errorCode: 'AI_CONFIG_FETCH_FAILED', safeDetails: scrubSensitiveFields(error) })
    );
    return NextResponse.json({ error: 'Internal server error', errorCode: 'AI_CONFIG_FETCH_FAILED' }, { status: 500 });
  }
}
