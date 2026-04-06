import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth/session';
import { store } from '@/lib/api/in-memory-store';

export async function GET() {
  const userId = await requireUserId();
  return NextResponse.json(store.getCategoryTreeForUser(userId));
}
