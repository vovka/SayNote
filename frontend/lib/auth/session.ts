import { headers } from 'next/headers';

export async function requireUserId() {
  const headerStore = await headers();
  const userId = headerStore.get('x-user-id') ?? headerStore.get('x-demo-user-id');

  if (!userId) {
    throw new Error('Unauthorized');
  }

  return userId;
}
