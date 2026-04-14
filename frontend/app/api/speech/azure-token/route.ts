import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth/session';
import { scrubSensitiveFields } from '@/lib/api/safe-logging';

function getAzureConfig() {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  const endpoint = process.env.AZURE_SPEECH_ENDPOINT;
  if (!key || !region) return null;
  return { key, region, endpoint };
}

function buildTokenEndpoint(region: string, endpoint?: string) {
  if (endpoint) return `${endpoint}/sts/v1.0/issueToken`;
  return `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`;
}

function buildExpiresAt() {
  // Azure tokens are valid for 10 minutes; use 9-minute safety margin
  return new Date(Date.now() + 9 * 60 * 1000).toISOString();
}

export async function GET(request: Request) {
  try {
    await requireUserId(request);

    const config = getAzureConfig();
    if (!config) {
      return NextResponse.json(
        { error: 'Azure Speech not configured', errorCode: 'AZURE_NOT_CONFIGURED' },
        { status: 503 }
      );
    }

    const tokenEndpoint = buildTokenEndpoint(config.region, config.endpoint);
    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Ocp-Apim-Subscription-Key': config.key }
    });

    if (!response.ok) {
      console.error(
        '[azure_token_issue_failed]',
        JSON.stringify({ errorCode: 'AZURE_TOKEN_ISSUE_FAILED', status: response.status })
      );
      return NextResponse.json(
        { error: 'Failed to issue Azure Speech token', errorCode: 'AZURE_TOKEN_ISSUE_FAILED' },
        { status: 502 }
      );
    }

    const token = await response.text();
    return NextResponse.json({ token, region: config.region, expiresAt: buildExpiresAt() });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', errorCode: 'UNAUTHORIZED' }, { status: 401 });
    }
    console.error(
      '[azure_token_failed]',
      JSON.stringify({ errorCode: 'AZURE_TOKEN_FAILED', safeDetails: scrubSensitiveFields(error) })
    );
    return NextResponse.json({ error: 'Internal server error', errorCode: 'AZURE_TOKEN_FAILED' }, { status: 500 });
  }
}
