import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth/session';
import { scrubSensitiveFields } from '@/lib/api/safe-logging';
import { updateCategoryLock } from '@/lib/api/supabase-server';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId(request);
    const { id } = await context.params;
    const body = await request.json() as { isLocked?: unknown };

    if (typeof body.isLocked !== 'boolean') {
      return NextResponse.json({ error: 'Invalid request', errorCode: 'INVALID_LOCK_STATE' }, { status: 400 });
    }

    const updated = await updateCategoryLock(userId, id, body.isLocked);
    if (!updated) {
      return NextResponse.json({ error: 'Not found', errorCode: 'CATEGORY_NOT_FOUND' }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', errorCode: 'UNAUTHORIZED' }, { status: 401 });
    }

    console.error(
      '[category_patch_route_failed]',
      JSON.stringify({ errorCode: 'CATEGORY_LOCK_UPDATE_FAILED', safeDetails: scrubSensitiveFields(error) })
    );
    return NextResponse.json({ error: 'Internal server error', errorCode: 'CATEGORY_LOCK_UPDATE_FAILED' }, { status: 500 });
  }
}
