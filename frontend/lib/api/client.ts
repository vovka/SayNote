export async function uploadAudio(formData: FormData) {
  const response = await fetch('/api/audio/upload', { method: 'POST', body: formData });
  if (!response.ok) throw new Error('Upload failed');
  return response.json();
}

export async function getNotes() {
  const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/api/notes`, {
    cache: 'no-store'
  });
  if (!response.ok) return [];
  return response.json();
}

export async function putAIConfig(input: {
  primaryProvider: string;
  transcriptionModel: string;
  categorizationModel: string;
}) {
  const response = await fetch('/api/settings/ai-config', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });
  if (!response.ok) throw new Error('Failed to save AI config');
}

export async function putAICredentials(input: { provider: string; apiKey: string }) {
  const response = await fetch('/api/settings/ai-credentials', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });
  if (!response.ok) throw new Error('Failed to save credentials');
}
