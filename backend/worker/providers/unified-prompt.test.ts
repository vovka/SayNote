import test from 'node:test';
import assert from 'node:assert/strict';
import type { UnifiedCategorizationRequest } from '../../../shared/types/provider';
import { buildUnifiedPrompt } from './unified-prompt.ts';

const payload: UnifiedCategorizationRequest = {
  newNote: { text: 'buy groceries', createdAt: '2024-01-01T00:00:00Z' },
  existingCategories: [{ id: 'c1', path: 'Home', depth: 1, isLocked: false, noteCount: 3 }],
  existingNotes: [],
  rules: {
    reuseExistingCategoryWhenItFits: true,
    allDepthsAreEquallyValid: true,
    doNotPreferNestedCategories: true,
    doNotMoveLockedSubtrees: true,
    omitLowConfidenceRecategorizations: false
  }
};

test('buildUnifiedPrompt embeds the serialized payload verbatim', () => {
  assert.ok(buildUnifiedPrompt(payload).includes(JSON.stringify(payload)));
});

test('buildUnifiedPrompt demands JSON-only response', () => {
  assert.ok(buildUnifiedPrompt(payload).includes('Return strict JSON only.'));
});

test('buildUnifiedPrompt instructs reuse of existing categories', () => {
  assert.ok(buildUnifiedPrompt(payload).includes('Reuse an existing category whenever one fits.'));
});

test('buildUnifiedPrompt enforces depth neutrality', () => {
  const prompt = buildUnifiedPrompt(payload);
  assert.ok(prompt.includes('All category depths are equally valid.'));
  assert.ok(prompt.includes('Do not prefer 2-level categories.'));
  assert.ok(prompt.includes('Do not prefer nested categories by default.'));
});

test('buildUnifiedPrompt protects locked subtrees', () => {
  assert.ok(buildUnifiedPrompt(payload).includes('Never move notes into or out of locked categories/subtrees.'));
});

test('buildUnifiedPrompt allows zero recategorizations', () => {
  assert.ok(buildUnifiedPrompt(payload).includes('Returning zero recategorizations is valid.'));
});
