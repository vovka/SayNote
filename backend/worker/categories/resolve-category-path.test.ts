import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCategoryPath, resolveCategoryPath } from './resolve-category-path.ts';

class CategoryClient {
  readonly categories = new Map<string, { id: string; userId: string; parentId: string | null; name: string }>();
  private nextId = 1;

  async query(_sql: string, params: unknown[]) {
    const [userId, parentId, segment] = params as [string, string | null, string];
    const existing = [...this.categories.values()].find(
      (category) => category.userId === userId && category.parentId === parentId && category.name === segment
    );

    if (existing) {
      return { rows: [{ id: existing.id }] };
    }

    const id = `cat-${this.nextId++}`;
    this.categories.set(id, { id, userId, parentId, name: segment });
    return { rows: [{ id }] };
  }
}

test('normalizeCategoryPath trims segments and removes empty values', () => {
  assert.deepEqual(normalizeCategoryPath([' Inbox ', '', '  Ideas  ', '  ']), ['Inbox', 'Ideas']);
});

test('resolveCategoryPath is idempotent for the same nested path', async () => {
  const client = new CategoryClient();

  const first = await resolveCategoryPath(client as never, 'user-1', ['Inbox', 'Ideas']);
  const second = await resolveCategoryPath(client as never, 'user-1', ['Inbox', 'Ideas']);

  assert.equal(first, second);
  assert.equal(client.categories.size, 2);
});

test('resolveCategoryPath preserves nested tree correctness', async () => {
  const client = new CategoryClient();

  await resolveCategoryPath(client as never, 'user-1', ['Inbox', 'Ideas']);
  await resolveCategoryPath(client as never, 'user-1', ['Inbox', 'Meetings']);

  const categories = [...client.categories.values()];
  const inbox = categories.find((category) => category.name === 'Inbox' && category.parentId === null);
  assert.ok(inbox);

  const ideas = categories.find((category) => category.name === 'Ideas');
  const meetings = categories.find((category) => category.name === 'Meetings');
  assert.equal(ideas?.parentId, inbox.id);
  assert.equal(meetings?.parentId, inbox.id);
});
