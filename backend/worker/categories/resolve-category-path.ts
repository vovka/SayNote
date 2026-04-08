import type { PoolClient, QueryResult } from 'pg';

function normalizeCategorySegment(segment: string) {
  return segment.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function normalizeCategoryPath(path: string[]) {
  return path.map((segment) => segment.trim().replace(/\s+/g, ' ')).filter(Boolean);
}

export function normalizeCategoryPathText(path: string[]) {
  return normalizeCategoryPath(path).map(normalizeCategorySegment).join(' > ');
}

function splitPath(path: string) {
  return path.split('>').map((segment) => segment.trim()).filter(Boolean);
}

export async function resolveCategoryPath(client: PoolClient, userId: string, categoryPath: string[]) {
  const normalizedPath = normalizeCategoryPath(categoryPath);
  const normalizedPathText = normalizeCategoryPathText(categoryPath);

  const existingByNormalizedPath: QueryResult<{ id: string }> = await client.query(
    `select id
     from categories
     where user_id = $1
       and normalized_path_cache = $2
     limit 1`,
    [userId, normalizedPathText]
  );

  const existing = existingByNormalizedPath.rows[0]?.id;
  if (existing) {
    return existing;
  }

  let parentId: string | null = null;
  const builtDisplaySegments: string[] = [];

  for (const segment of normalizedPath) {
    const normalizedName = normalizeCategorySegment(segment);
    const nextDisplayPath = [...builtDisplaySegments, segment].join(' > ');
    const nextNormalizedPath = [...builtDisplaySegments, segment].map(normalizeCategorySegment).join(' > ');

    const upserted: QueryResult<{ id: string; name: string }> = await client.query(
      `insert into categories (user_id, parent_id, name, normalized_name, path_cache, normalized_path_cache)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (user_id, parent_id, normalized_name)
       do update set updated_at = now()
       returning id, name`,
      [userId, parentId, segment, normalizedName, nextDisplayPath, nextNormalizedPath]
    );

    const row = upserted.rows[0];
    parentId = row?.id ?? null;
    builtDisplaySegments.push(row?.name ?? segment);
  }

  if (!parentId) {
    throw new Error('Model returned an empty category path');
  }

  return parentId;
}

export async function resolveCategorySelection(client: PoolClient, input: {
  userId: string;
  selectedCategoryId?: string;
  newCategoryPath?: string;
}) {
  if (input.selectedCategoryId) {
    const found: QueryResult<{ id: string }> = await client.query(
      `select id from categories where id = $1 and user_id = $2 limit 1`,
      [input.selectedCategoryId, input.userId]
    );

    const existing = found.rows[0]?.id;
    if (!existing) {
      throw new Error('Selected category id was not found for user');
    }

    return existing;
  }

  if (!input.newCategoryPath) {
    throw new Error('Either selectedCategoryId or newCategoryPath is required');
  }

  return resolveCategoryPath(client, input.userId, splitPath(input.newCategoryPath));
}
