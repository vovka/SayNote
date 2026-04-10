import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth/session';
import { scrubSensitiveFields } from '@/lib/api/safe-logging';
import { deleteNoteForUser, updateNoteForUser } from '@/lib/api/supabase-server';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId(request);
    const { id } = await context.params;
    const body = await request.json() as { text?: unknown };
    if (typeof body.text !== 'string' || !body.text.trim()) {
      return NextResponse.json({ error: 'Invalid request', errorCode: 'INVALID_NOTE_TEXT' }, { status: 400 });
    }
    const updated = await updateNoteForUser(userId, id, body.text.trim());
    if (!updated) {
      return NextResponse.json({ error: 'Not found', errorCode: 'NOTE_NOT_FOUND' }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', errorCode: 'UNAUTHORIZED' }, { status: 401 });
    }
    console.error(
      '[note_patch_route_failed]',
      JSON.stringify({ errorCode: 'NOTE_UPDATE_FAILED', safeDetails: scrubSensitiveFields(error) })
    );
    return NextResponse.json({ error: 'Internal server error', errorCode: 'NOTE_UPDATE_FAILED' }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId(request);
    const { id } = await context.params;
    const deleted = await deleteNoteForUser(userId, id);
    if (!deleted) {
      return NextResponse.json({ error: 'Not found', errorCode: 'NOTE_NOT_FOUND' }, { status: 404 });
    }
    return NextResponse.json({ id });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', errorCode: 'UNAUTHORIZED' }, { status: 401 });
    }
    console.error(
      '[note_delete_route_failed]',
      JSON.stringify({ errorCode: 'NOTE_DELETE_FAILED', safeDetails: scrubSensitiveFields(error) })
    );
    return NextResponse.json({ error: 'Internal server error', errorCode: 'NOTE_DELETE_FAILED' }, { status: 500 });
  }
}
