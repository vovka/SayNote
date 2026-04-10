import { getUserIdFromRequestAuth } from '@/lib/supabase/server';

export async function requireUserId(request: Request) {
  const userId = await getUserIdFromRequestAuth(request);
  if (!userId) {
    throw new Error('Unauthorized');
  }

  return userId;
}
