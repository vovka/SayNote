import type { UnifiedCategorizationRequest } from '../../../shared/types/provider';

export function buildUnifiedPrompt(payload: UnifiedCategorizationRequest): string {
  return [
    'Return strict JSON only.',
    'Schema:',
    '{"newNoteAssignment":{"selectedCategoryId?":string,"newCategoryPath?":string,"confidence?":number,"reason?":string},"recategorizations":[{"noteId":string,"targetCategoryId?":string,"newCategoryPath?":string,"confidence?":number,"reason?":string}]}',
    'Rules:',
    '- Reuse an existing category whenever one fits.',
    '- Choose the best matching existing category regardless of depth.',
    '- All category depths are equally valid.',
    '- Do not prefer 2-level categories.',
    '- Do not prefer nested categories by default.',
    '- Do not prefer shallow categories for their own sake.',
    '- Do not prefer deep categories for their own sake.',
    '- Depth must be based only on semantic fit and consistency.',
    '- Create a new category only when no existing category is a good fit.',
    '- Do not invent synonyms, spelling variants, or casing variants when an existing category fits.',
    '- Automatic recategorization is optional and best-effort.',
    '- Only include recategorizations that clearly improve consistency.',
    '- Returning zero recategorizations is valid.',
    '- Never move notes into or out of locked categories/subtrees.',
    '- For each assignment, exactly one of selectedCategoryId/newCategoryPath must be present.',
    'Payload JSON:',
    JSON.stringify(payload)
  ].join('\n');
}
