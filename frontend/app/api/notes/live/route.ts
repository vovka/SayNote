import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId } from '@/lib/auth/session';
import { withClient } from '@/../backend/worker/db';
import { finalizeTextNote } from '@/../backend/worker/jobs/finalize-text-note';
import { getNotesTreeForUser } from '@/lib/api/supabase-server';
import { scrubSensitiveFields } from '@/lib/api/safe-logging';

const schema = z.object({
  text: z.string().min(1, 'Transcript must not be empty').max(50_000),
  createdAt: z.string().datetime({ offset: true }),
  durationMs: z.number().int().min(0),
  speechLanguage: z.string().min(2),
  clientSessionId: z.string().uuid(),
  clientRecordingId: z.string().uuid(),
  transcriptionSource: z.literal('azure_live')
});

export async function POST(request: Request) {
  try {
    const userId = await requireUserId(request);
    const rawPayload = await request.json();
    const payload = schema.parse(rawPayload);

    const { noteId, jobId } = await withClient((client) =>
      finalizeTextNote(client, {
        userId,
        text: payload.text,
        createdAt: payload.createdAt,
        durationMs: payload.durationMs,
        clientRecordingId: payload.clientRecordingId,
        idempotencyKey: payload.clientSessionId,
        speechLanguage: payload.speechLanguage
      })
    );

    const notesTree = await getNotesTreeForUser(userId);

    return NextResponse.json({ note: { id: noteId, jobId }, notesTree });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', errorCode: 'UNAUTHORIZED' }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      const firstIssue = error.issues[0];
      const isEmptyTranscript = firstIssue?.path[0] === 'text';
      return NextResponse.json(
        {
          error: isEmptyTranscript ? 'Transcript must not be empty' : 'Invalid payload',
          errorCode: isEmptyTranscript ? 'EMPTY_TRANSCRIPT' : 'INVALID_PAYLOAD'
        },
        { status: 400 }
      );
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON payload', errorCode: 'INVALID_PAYLOAD' }, { status: 400 });
    }
    if (error instanceof Error && error.message.includes('AI configuration missing')) {
      return NextResponse.json({ error: 'AI config not set up', errorCode: 'AI_CONFIG_MISSING' }, { status: 422 });
    }
    if (error instanceof Error && error.message.includes('AI credential missing')) {
      return NextResponse.json({ error: 'AI config not set up', errorCode: 'AI_CONFIG_MISSING' }, { status: 422 });
    }
    console.error(
      '[live_note_finalize_failed]',
      JSON.stringify({ errorCode: 'LIVE_NOTE_FINALIZE_FAILED', safeDetails: scrubSensitiveFields(error) })
    );
    return NextResponse.json(
      { error: 'Internal server error', errorCode: 'LIVE_NOTE_FINALIZE_FAILED' },
      { status: 500 }
    );
  }
}
