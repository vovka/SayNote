import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth/session';
import { scrubSensitiveFields } from '@/lib/api/safe-logging';
import { deleteCategoryForUser, renameCategoryForUser, updateCategoryLock } from '@/lib/api/supabase-server';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId(request);
    const { id } = await context.params;
    const body = await request.json() as { isLocked?: unknown; name?: unknown };

    if (typeof body.isLocked === 'boolean') {
      const updated = await updateCategoryLock(userId, id, body.isLocked);
      if (!updated) {
        return NextResponse.json({ error: 'Not found', errorCode: 'CATEGORY_NOT_FOUND' }, { status: 404 });
      }
      return NextResponse.json(updated);
    }

    if (typeof body.name === 'string') {
      const name = body.name.trim();
      if (!name) {
        return NextResponse.json({ error: 'Invalid request', errorCode: 'INVALID_CATEGORY_NAME' }, { status: 400 });
      }
      const updated = await renameCategoryForUser(userId, id, name);
      if (!updated) {
        return NextResponse.json({ error: 'Not found', errorCode: 'CATEGORY_NOT_FOUND' }, { status: 404 });
      }
      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: 'Invalid request', errorCode: 'INVALID_CATEGORY_PATCH' }, { status: 400 });
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

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId(request);
    const { id } = await context.params;
    const deleted = await deleteCategoryForUser(userId, id);
    if (!deleted) {
      return NextResponse.json({ error: 'Not found', errorCode: 'CATEGORY_NOT_FOUND' }, { status: 404 });
    }
    return NextResponse.json({ id });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', errorCode: 'UNAUTHORIZED' }, { status: 401 });
    }
    if (error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === '23503') {
      return NextResponse.json(
        { error: 'Category has dependent notes or sub-categories', errorCode: 'CATEGORY_HAS_DEPENDENCIES' },
        { status: 409 }
      );
    }
    console.error(
      '[category_delete_route_failed]',
      JSON.stringify({ errorCode: 'CATEGORY_DELETE_FAILED', safeDetails: scrubSensitiveFields(error) })
    );
    return NextResponse.json({ error: 'Internal server error', errorCode: 'CATEGORY_DELETE_FAILED' }, { status: 500 });
  }
}
