import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth/session';
import { getNotesTreeForUser } from '@/lib/api/supabase-server';
import { logSanitizedApiError } from '@/lib/api/logging';

export async function GET(request: Request) {
  try {
    const userId = await requireUserId(request);
    return NextResponse.json(await getNotesTreeForUser(userId));
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    logSanitizedApiError('Notes route failed', error, { route: '/api/notes' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
