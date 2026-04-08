import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('provider prompts require reuse-first depth-neutral behavior and locked subtree protections', async () => {
  const [groqSource, openRouterSource] = await Promise.all([
    readFile(new URL('./groq.ts', import.meta.url), 'utf8'),
    readFile(new URL('./openrouter.ts', import.meta.url), 'utf8')
  ]);

  for (const source of [groqSource, openRouterSource]) {
    assert.match(source, /Reuse an existing category whenever one fits/);
    assert.match(source, /All category depths are equally valid/);
    assert.match(source, /Do not prefer 2-level categories/);
    assert.match(source, /Do not prefer nested categories by default/);
    assert.match(source, /Never move notes into or out of locked categories\/subtrees/);
    assert.match(source, /Returning zero recategorizations is valid/);
    assert.match(source, /Return strict JSON only/);
  }
});
