import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('settings helper supports fallback hydration, shared-policy validation, and key status copy', async () => {
  const source = await readFile(new URL('./ai-config-form.ts', import.meta.url), 'utf8');

  assert.match(source, /fallbackProvider: response\.fallbackProvider \?\? ''/);
  assert.match(source, /fallbackTranscriptionModel: response\.fallbackTranscriptionModel \?\? ''/);
  assert.match(source, /fallbackCategorizationModel: response\.fallbackCategorizationModel \?\? ''/);
  assert.match(source, /validateAIProviderConfig\(payload\)/);
  assert.match(source, /key status: Stored/);
  assert.match(source, /key status: Not stored/);
  assert.match(source, /Active path: primary/);
});
