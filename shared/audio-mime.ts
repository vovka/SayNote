export const SUPPORTED_AUDIO_MIME_TYPES = ['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav'] as const;

export type SupportedAudioMimeType = (typeof SUPPORTED_AUDIO_MIME_TYPES)[number];

const MIME_TYPE_ALIASES: Record<string, SupportedAudioMimeType> = {
  'audio/mp3': 'audio/mpeg',
  'audio/wave': 'audio/wav',
  'audio/x-wav': 'audio/wav'
};

export function normalizeAudioMimeType(mimeType: string) {
  const baseMimeType = mimeType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  return MIME_TYPE_ALIASES[baseMimeType] ?? baseMimeType;
}

export function toSupportedAudioMimeType(mimeType: string): SupportedAudioMimeType | null {
  const normalizedMimeType = normalizeAudioMimeType(mimeType);
  return SUPPORTED_AUDIO_MIME_TYPES.includes(normalizedMimeType as SupportedAudioMimeType)
    ? (normalizedMimeType as SupportedAudioMimeType)
    : null;
}

export function audioFileExtension(mimeType: string) {
  switch (toSupportedAudioMimeType(mimeType)) {
    case 'audio/webm':
      return 'webm';
    case 'audio/mp4':
      return 'mp4';
    case 'audio/mpeg':
      return 'mp3';
    case 'audio/wav':
      return 'wav';
    default:
      return 'bin';
  }
}
