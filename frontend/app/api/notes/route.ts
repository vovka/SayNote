import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth/session';
import { getNotesTreeForUser } from '@/lib/api/supabase-server';

export async function GET() {
  try {
    const userId = await requireUserId();
    return NextResponse.json(await getNotesTreeForUser(userId));
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Notes route failed', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
