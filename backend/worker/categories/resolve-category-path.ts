export function normalizeCategoryPath(path: string[]) {
  return path.map((segment) => segment.trim()).filter(Boolean);
}
