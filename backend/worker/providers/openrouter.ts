import type { AIProviderAdapter, CategorizationResult, TranscriptionResult } from '../../../shared/types/provider';
import { mapHttpFailure, mapInvalidResponse, mapNetworkFailure, ProviderError } from './errors';

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

function normalizeCategoryPath(rawPath: unknown) {
  if (!Array.isArray(rawPath)) {
    throw mapInvalidResponse({ provider: 'openrouter', operation: 'categorize', reason: 'categoryPath must be an array' });
  }

  const categoryPath = rawPath
    .filter((segment): segment is string => typeof segment === 'string')
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (!categoryPath.length) {
    throw mapInvalidResponse({ provider: 'openrouter', operation: 'categorize', reason: 'categoryPath was empty' });
  }

  return categoryPath;
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

  async categorize(input: { text: string; model: string; apiKey: string; allowedCategories?: string[] }): Promise<CategorizationResult> {
    const prompt = `Return strict JSON with keys categoryPath (string[]) and confidence (0..1).\nAllowed categories: ${
      input.allowedCategories?.join(', ') || 'any'
    }\nText:\n${input.text}`;

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
            { role: 'system', content: 'Classify the note text into a category path. Return JSON only.' },
            { role: 'user', content: prompt }
          ]
        })
      });
    } catch (error) {
      throw mapNetworkFailure({ provider: 'openrouter', operation: 'categorize', error });
    }

    const body = await parseResponseBody(response);
    if (!response.ok) {
      throw mapHttpFailure({ provider: 'openrouter', operation: 'categorize', status: response.status, body });
    }

    if (!body || typeof body !== 'object') {
      throw mapInvalidResponse({ provider: 'openrouter', operation: 'categorize', reason: 'non-object response body' });
    }

    const content = parseMessageContent(body as JsonRecord);
    if (!content) {
      throw mapInvalidResponse({ provider: 'openrouter', operation: 'categorize', reason: 'missing completion content' });
    }

    let parsed: JsonRecord;
    try {
      parsed = JSON.parse(content) as JsonRecord;
    } catch {
      throw mapInvalidResponse({ provider: 'openrouter', operation: 'categorize', reason: 'content was not JSON' });
    }

    return {
      categoryPath: normalizeCategoryPath(parsed.categoryPath),
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : undefined,
      raw: body
    };
  }
}
