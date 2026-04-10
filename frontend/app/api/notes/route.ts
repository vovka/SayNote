import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth/session';
import { getNotesTreeForUser } from '@/lib/api/supabase-server';
import { scrubSensitiveFields } from '@/lib/api/safe-logging';

export async function GET(request: Request) {
  try {
    const userId = await requireUserId(request);
    return NextResponse.json(await getNotesTreeForUser(userId));
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', errorCode: 'UNAUTHORIZED' }, { status: 401 });
    }
    console.error('[notes_route_failed]', JSON.stringify({ errorCode: 'NOTES_FETCH_FAILED', safeDetails: scrubSensitiveFields(error) }));
    return NextResponse.json({ error: 'Internal server error', errorCode: 'NOTES_FETCH_FAILED' }, { status: 500 });
  }
}
