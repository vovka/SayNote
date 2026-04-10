export interface CategoryLockNode {
  id: string;
  parent_id: string | null;
  is_locked: boolean;
}

function buildChildrenMap(categories: CategoryLockNode[]) {
  const children = new Map<string, string[]>();
  for (const category of categories) {
    if (!category.parent_id) continue;
    const bucket = children.get(category.parent_id) ?? [];
    bucket.push(category.id);
    children.set(category.parent_id, bucket);
  }
  return children;
}

export function buildLockedSubtreeSet(categories: CategoryLockNode[]) {
  const lockedSet = new Set<string>();
  const childrenMap = buildChildrenMap(categories);
  const stack = categories.filter((category) => category.is_locked).map((category) => category.id);

  while (stack.length) {
    const current = stack.pop();
    if (!current || lockedSet.has(current)) {
      continue;
    }

    lockedSet.add(current);
    const children = childrenMap.get(current) ?? [];
    for (const child of children) {
      stack.push(child);
    }
  }

  return lockedSet;
}

export function isCategoryInLockedSubtree(categoryId: string | null | undefined, lockedSet: Set<string>) {
  if (!categoryId) {
    return false;
  }
  return lockedSet.has(categoryId);
}
