import type { PoolClient, QueryResult } from 'pg';

export function normalizeCategoryPath(path: string[]) {
  return path.map((segment) => segment.trim()).filter(Boolean);
}

export async function resolveCategoryPath(client: PoolClient, userId: string, categoryPath: string[]) {
  const normalizedPath = normalizeCategoryPath(categoryPath);
  let parentId: string | null = null;

  for (const segment of normalizedPath) {
    const upserted: QueryResult<{ id: string }> = await client.query(
      `insert into categories (user_id, parent_id, name)
       values ($1, $2, $3)
       on conflict (user_id, parent_id, name)
       do update set updated_at = now()
       returning id`,
      [userId, parentId, segment]
    );

    parentId = upserted.rows[0]?.id ?? null;
  }

  if (!parentId) {
    throw new Error('Model returned an empty category path');
  }

  return parentId;
}
