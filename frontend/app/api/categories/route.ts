import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth/session';
import { getCategoriesForUser, getCategoriesTreeForUser } from '@/lib/api/supabase-server';

/**
 * GET /api/categories
 *
 * Response contract for frontend consumers:
 * - Default (tree): [{ id, name, children: CategoryNode[] }]
 * - Flat mode (?format=flat): [{ id, parent_id, name }]
 */
export async function GET(request: Request) {
  try {
    const userId = await requireUserId(request);
    const url = new URL(request.url);
    const format = url.searchParams.get('format');

    if (format === 'flat') {
      return NextResponse.json(await getCategoriesForUser(userId));
    }

    return NextResponse.json(await getCategoriesTreeForUser(userId));
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.error('Categories route failed', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
