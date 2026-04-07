import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAIProviderConfig } from '../../../shared/types/model-policy.ts';

test('validateAIProviderConfig accepts supported provider/model combinations', () => {
  const result = validateAIProviderConfig({
    primaryProvider: 'groq',
    transcriptionModel: 'whisper-large-v3',
    categorizationModel: 'llama-3.3-70b-versatile',
    fallbackProvider: 'openrouter',
    fallbackTranscriptionModel: 'openai/gpt-4o-mini-transcribe',
    fallbackCategorizationModel: 'openai/gpt-4o-mini',
    fallbackOnTerminalPrimaryFailure: true
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.fallbackOnTerminalPrimaryFailure, true);
  }
});

test('validateAIProviderConfig rejects unsupported model combinations', () => {
  const result = validateAIProviderConfig({
    primaryProvider: 'groq',
    transcriptionModel: 'openai/gpt-4o-mini-transcribe',
    categorizationModel: 'llama-3.3-70b-versatile'
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, 'UNSUPPORTED_MODEL_COMBINATION');
    assert.equal(result.error.provider, 'groq');
    assert.equal(result.error.operation, 'transcribe');
  }
});
