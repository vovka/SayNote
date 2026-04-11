import type {
  AIProviderAdapter,
  CategorizeWithReviewResult,
  TranscriptionResult,
  UnifiedCategorizationRequest,
  UnifiedRecategorization
} from '../../../shared/types/provider';
import {
  mapHttpFailure,
  mapInvalidResponse,
  mapNetworkFailure,
  ProviderError,
  type ProviderErrorOptions
} from './errors';
import { buildUnifiedPrompt } from './unified-prompt';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

type JsonRecord = Record<string, unknown>;

async function parseResponseBody(response: Response) {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
}

function openRouterHeaders(apiKey: string, hasJson = true): HeadersInit {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'HTTP-Referer': 'https://saynote.local',
    'X-Title': 'SayNote Worker'
  };

  if (hasJson) {
    headers['Content-Type'] = 'application/json';
  }

  return headers;
}

function parseMessageContent(body: JsonRecord) {
  const choices = body.choices;
  if (!Array.isArray(choices) || !choices.length) return undefined;
  const first = choices[0] as JsonRecord;
  const message = first.message;
  if (!message || typeof message !== 'object') return undefined;
  const content = (message as JsonRecord).content;
  return typeof content === 'string' ? content : undefined;
}

function normalizeAssignment(raw: unknown, operation: ProviderErrorOptions['operation']) {
  if (!raw || typeof raw !== 'object') {
    throw mapInvalidResponse({ provider: 'openrouter', operation, reason: 'assignment must be an object' });
  }

  const assignment = raw as JsonRecord;
  const selectedCategoryId = typeof assignment.selectedCategoryId === 'string' ? assignment.selectedCategoryId.trim() : undefined;
  const newCategoryPath = typeof assignment.newCategoryPath === 'string' ? assignment.newCategoryPath.trim() : undefined;

  if (!!selectedCategoryId === !!newCategoryPath) {
    throw mapInvalidResponse({
      provider: 'openrouter',
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
        throw mapInvalidResponse({ provider: 'openrouter', operation: 'categorizeWithReview', reason: 'recategorization noteId is required' });
      }
      const targetCategoryId = typeof item.targetCategoryId === 'string' ? item.targetCategoryId : undefined;
      const normalized = normalizeAssignment({
        selectedCategoryId: targetCategoryId ?? item.selectedCategoryId,
        newCategoryPath: item.newCategoryPath,
        confidence: item.confidence,
        reason: item.reason
      }, 'categorizeWithReview');
      return { noteId, ...normalized };
    });
}


export class OpenRouterAdapter implements AIProviderAdapter {
  async transcribe(input: {
    model: string;
    apiKey: string;
    audioUrl?: string;
    audioBuffer?: Buffer;
    metadata?: Record<string, unknown>;
  }): Promise<TranscriptionResult> {
    if (!input.audioBuffer && !(input.audioUrl && /^https?:\/\//.test(input.audioUrl))) {
      throw new ProviderError({
        provider: 'openrouter',
        operation: 'transcribe',
        kind: 'terminal',
        code: 'MISSING_AUDIO_INPUT',
        safeMessage: 'openrouter transcribe requires audioBuffer or public audioUrl'
      });
    }

    const audioPart = input.audioBuffer
      ? {
          type: 'input_audio' as const,
          input_audio: {
            data: input.audioBuffer.toString('base64'),
            format: typeof input.metadata?.contentType === 'string' && input.metadata.contentType.includes('/')
              ? input.metadata.contentType.split('/')[1]
              : 'wav'
          }
        }
      : {
          type: 'input_audio' as const,
          input_audio: {
            url: input.audioUrl
          }
        };

    let response: Response;
    try {
      response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: openRouterHeaders(input.apiKey),
        body: JSON.stringify({
          model: input.model,
          temperature: 0,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Transcribe this audio and return plain text only.' },
                audioPart
              ]
            }
          ]
        })
      });
    } catch (error) {
      throw mapNetworkFailure({ provider: 'openrouter', operation: 'transcribe', error });
    }

    const body = await parseResponseBody(response);
    if (!response.ok) {
      throw mapHttpFailure({ provider: 'openrouter', operation: 'transcribe', status: response.status, body });
    }

    if (!body || typeof body !== 'object') {
      throw mapInvalidResponse({ provider: 'openrouter', operation: 'transcribe', reason: 'non-object response body' });
    }

    const text = parseMessageContent(body as JsonRecord)?.trim();
    if (!text) {
      throw mapInvalidResponse({ provider: 'openrouter', operation: 'transcribe', reason: 'missing transcription text' });
    }

    return { text, raw: body };
  }

  async categorizeWithReview(input: { model: string; apiKey: string; payload: UnifiedCategorizationRequest }): Promise<CategorizeWithReviewResult> {
    const prompt = buildUnifiedPrompt(input.payload);

    let response: Response;
    try {
      response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: openRouterHeaders(input.apiKey),
        body: JSON.stringify({
          model: input.model,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: 'You classify notes. Return strict JSON only with no markdown.' },
            { role: 'user', content: prompt }
          ]
        })
      });
    } catch (error) {
      throw mapNetworkFailure({ provider: 'openrouter', operation: 'categorizeWithReview', error });
    }

    const body = await parseResponseBody(response);
    if (!response.ok) {
      throw mapHttpFailure({ provider: 'openrouter', operation: 'categorizeWithReview', status: response.status, body });
    }

    if (!body || typeof body !== 'object') {
      throw mapInvalidResponse({ provider: 'openrouter', operation: 'categorizeWithReview', reason: 'non-object response body' });
    }

    const content = parseMessageContent(body as JsonRecord);
    if (!content) {
      throw mapInvalidResponse({ provider: 'openrouter', operation: 'categorizeWithReview', reason: 'missing completion content' });
    }

    let parsed: JsonRecord;
    try {
      parsed = JSON.parse(content) as JsonRecord;
    } catch {
      throw mapInvalidResponse({ provider: 'openrouter', operation: 'categorizeWithReview', reason: 'content was not JSON' });
    }

    return {
      newNoteAssignment: normalizeAssignment(parsed.newNoteAssignment, 'categorizeWithReview'),
      recategorizations: normalizeRecategorizations(parsed.recategorizations),
      raw: body
    };
  }
}
