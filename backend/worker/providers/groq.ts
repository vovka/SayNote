import type { AIProviderAdapter, CategorizationResult, TranscriptionResult } from '../../../shared/types/provider';
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

function getTextFromCategorization(body: JsonRecord) {
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
  if (typeof content === 'string') {
    return content;
  }

  return undefined;
}

function normalizeCategoryPath(rawPath: unknown) {
  if (!Array.isArray(rawPath)) {
    throw mapInvalidResponse({ provider: 'groq', operation: 'categorize', reason: 'categoryPath must be an array' });
  }

  const categoryPath = rawPath
    .filter((segment): segment is string => typeof segment === 'string')
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (!categoryPath.length) {
    throw mapInvalidResponse({ provider: 'groq', operation: 'categorize', reason: 'categoryPath was empty' });
  }

  return categoryPath;
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

  async categorize(input: { text: string; model: string; apiKey: string; allowedCategories?: string[] }): Promise<CategorizationResult> {
    const prompt = `Return strict JSON with keys categoryPath (string[]) and confidence (0..1).\nAllowed categories: ${
      input.allowedCategories?.join(', ') || 'any'
    }\nText:\n${input.text}`;

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
              content: 'Classify the note text into a category path. Return JSON only.'
            },
            {
              role: 'user',
              content: prompt
            }
          ]
        })
      });
    } catch (error) {
      throw mapNetworkFailure({ provider: 'groq', operation: 'categorize', error });
    }

    const body = await parseResponseBody(response);
    if (!response.ok) {
      throw mapHttpFailure({ provider: 'groq', operation: 'categorize', status: response.status, body });
    }

    if (!body || typeof body !== 'object') {
      throw mapInvalidResponse({ provider: 'groq', operation: 'categorize', reason: 'non-object response body' });
    }

    const content = getTextFromCategorization(body as JsonRecord);
    if (!content) {
      throw mapInvalidResponse({ provider: 'groq', operation: 'categorize', reason: 'missing completion content' });
    }

    let parsed: JsonRecord;
    try {
      parsed = JSON.parse(content) as JsonRecord;
    } catch {
      throw mapInvalidResponse({ provider: 'groq', operation: 'categorize', reason: 'content was not JSON' });
    }

    const categoryPath = normalizeCategoryPath(parsed.categoryPath);
    const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : undefined;

    return {
      categoryPath,
      confidence,
      raw: body
    };
  }
}
