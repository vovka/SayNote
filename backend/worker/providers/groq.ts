import type {
  AIProviderAdapter,
  CategorizeWithReviewResult,
  TranscriptionResult,
  UnifiedCategorizationRequest,
  UnifiedRecategorization
} from '../../../shared/types/provider';
import { mapHttpFailure, mapInvalidResponse, mapNetworkFailure, ProviderError } from './errors';

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

type JsonRecord = Record<string, unknown>;

async function parseResponseBody(response: Response) {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
}

function getTextFromCompletion(body: JsonRecord) {
  const choices = body.choices;
  if (!Array.isArray(choices) || !choices.length) {
    return undefined;
  }

  const first = choices[0] as JsonRecord;
  const message = first.message;
  if (!message || typeof message !== 'object') {
    return undefined;
  }

  const content = (message as JsonRecord).content;
  return typeof content === 'string' ? content : undefined;
}

function normalizeAssignment(raw: unknown, operation: string) {
  if (!raw || typeof raw !== 'object') {
    throw mapInvalidResponse({ provider: 'groq', operation, reason: 'assignment must be an object' });
  }

  const assignment = raw as JsonRecord;
  const selectedCategoryId = typeof assignment.selectedCategoryId === 'string' ? assignment.selectedCategoryId.trim() : undefined;
  const newCategoryPath = typeof assignment.newCategoryPath === 'string' ? assignment.newCategoryPath.trim() : undefined;

  if (!!selectedCategoryId === !!newCategoryPath) {
    throw mapInvalidResponse({
      provider: 'groq',
      operation,
      reason: 'exactly one of selectedCategoryId or newCategoryPath is required'
    });
  }

  return {
    selectedCategoryId,
    newCategoryPath,
    confidence: typeof assignment.confidence === 'number' ? assignment.confidence : undefined,
    reason: typeof assignment.reason === 'string' ? assignment.reason : undefined
  };
}

function normalizeRecategorizations(raw: unknown) {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter((item): item is JsonRecord => Boolean(item) && typeof item === 'object')
    .map((item): UnifiedRecategorization => {
      const noteId = typeof item.noteId === 'string' ? item.noteId.trim() : '';
      if (!noteId) {
        throw mapInvalidResponse({ provider: 'groq', operation: 'categorizeWithReview', reason: 'recategorization noteId is required' });
      }
      const targetCategoryId = typeof item.targetCategoryId === 'string' ? item.targetCategoryId : undefined;
      return {
        noteId,
        ...normalizeAssignment({
          selectedCategoryId: targetCategoryId ?? item.selectedCategoryId,
          newCategoryPath: item.newCategoryPath,
          confidence: item.confidence,
          reason: item.reason
        }, 'categorizeWithReview')
      };
    });
}

function buildUnifiedPrompt(payload: UnifiedCategorizationRequest) {
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

export class GroqAdapter implements AIProviderAdapter {
  async transcribe(input: {
    model: string;
    apiKey: string;
    audioUrl?: string;
    audioBuffer?: Buffer;
    metadata?: Record<string, unknown>;
  }): Promise<TranscriptionResult> {
    const form = new FormData();
    form.set('model', input.model);

    if (input.audioBuffer && input.audioBuffer.byteLength > 0) {
      const contentType = typeof input.metadata?.contentType === 'string' ? input.metadata.contentType : 'audio/webm';
      const storageKey = typeof input.metadata?.storageKey === 'string' ? input.metadata.storageKey : '';
      const extension = storageKey.split('.').pop() || 'webm';
      const file = new Blob([new Uint8Array(input.audioBuffer)], { type: contentType });
      form.set('file', file, `recording.${extension}`);
    } else if (input.audioUrl && /^https?:\/\//.test(input.audioUrl)) {
      form.set('url', input.audioUrl);
    } else {
      throw new ProviderError({
        provider: 'groq',
        operation: 'transcribe',
        kind: 'terminal',
        code: 'MISSING_AUDIO_INPUT',
        safeMessage: 'groq transcribe requires audioBuffer or public audioUrl'
      });
    }

    let response: Response;
    try {
      response = await fetch(`${GROQ_BASE_URL}/audio/transcriptions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${input.apiKey}`
        },
        body: form
      });
    } catch (error) {
      throw mapNetworkFailure({ provider: 'groq', operation: 'transcribe', error });
    }

    const body = await parseResponseBody(response);
    if (!response.ok) {
      throw mapHttpFailure({ provider: 'groq', operation: 'transcribe', status: response.status, body });
    }

    if (!body || typeof body !== 'object' || typeof (body as JsonRecord).text !== 'string') {
      throw mapInvalidResponse({ provider: 'groq', operation: 'transcribe', reason: 'missing text' });
    }

    return {
      text: ((body as JsonRecord).text as string).trim(),
      raw: body
    };
  }

  async categorizeWithReview(input: { model: string; apiKey: string; payload: UnifiedCategorizationRequest }): Promise<CategorizeWithReviewResult> {
    const prompt = buildUnifiedPrompt(input.payload);

    let response: Response;
    try {
      response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${input.apiKey}`
        },
        body: JSON.stringify({
          model: input.model,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: 'You classify notes. Return strict JSON only with no markdown.'
            },
            {
              role: 'user',
              content: prompt
            }
          ]
        })
      });
    } catch (error) {
      throw mapNetworkFailure({ provider: 'groq', operation: 'categorizeWithReview', error });
    }

    const body = await parseResponseBody(response);
    if (!response.ok) {
      throw mapHttpFailure({ provider: 'groq', operation: 'categorizeWithReview', status: response.status, body });
    }

    if (!body || typeof body !== 'object') {
      throw mapInvalidResponse({ provider: 'groq', operation: 'categorizeWithReview', reason: 'non-object response body' });
    }

    const content = getTextFromCompletion(body as JsonRecord);
    if (!content) {
      throw mapInvalidResponse({ provider: 'groq', operation: 'categorizeWithReview', reason: 'missing completion content' });
    }

    let parsed: JsonRecord;
    try {
      parsed = JSON.parse(content) as JsonRecord;
    } catch {
      throw mapInvalidResponse({ provider: 'groq', operation: 'categorizeWithReview', reason: 'content was not JSON' });
    }

    return {
      newNoteAssignment: normalizeAssignment(parsed.newNoteAssignment, 'categorizeWithReview'),
      recategorizations: normalizeRecategorizations(parsed.recategorizations),
      raw: body
    };
  }
}
