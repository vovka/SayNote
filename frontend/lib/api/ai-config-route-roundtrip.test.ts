import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('ai-config route and storage include fallback fields + provider key presence roundtrip', async () => {
  const routeSource = await readFile(new URL('../../app/api/settings/ai-config/route.ts', import.meta.url), 'utf8');
  const serverSource = await readFile(new URL('./supabase-server.ts', import.meta.url), 'utf8');

  assert.match(routeSource, /fallbackProvider: z\.string\(\)\.optional\(\)/);
  assert.match(routeSource, /fallbackTranscriptionModel: z\.string\(\)\.optional\(\)/);
  assert.match(routeSource, /fallbackCategorizationModel: z\.string\(\)\.optional\(\)/);
  assert.match(routeSource, /fallbackOnTerminalPrimaryFailure: z\.boolean\(\)\.optional\(\)/);

  assert.match(serverSource, /fallback_provider: config\.fallbackProvider \?\? null/);
  assert.match(serverSource, /fallback_transcription_model: config\.fallbackTranscriptionModel \?\? null/);
  assert.match(serverSource, /fallback_categorization_model: config\.fallbackCategorizationModel \?\? null/);
  assert.match(serverSource, /fallback_on_terminal_primary_failure: config\.fallbackOnTerminalPrimaryFailure/);
  assert.match(serverSource, /providersWithKey: \(credsResult\.data \?\? \[\]\)\.map\(\(row\) => row\.provider\)/);
});
