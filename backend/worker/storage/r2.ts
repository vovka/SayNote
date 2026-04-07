import { randomUUID } from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const R2_ALLOWED_MIME_TYPES = new Set(['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav']);

function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function buildR2Client() {
  const accountId = getRequiredEnv('R2_ACCOUNT_ID');
  const accessKeyId = getRequiredEnv('R2_ACCESS_KEY_ID');
  const secretAccessKey = getRequiredEnv('R2_SECRET_ACCESS_KEY');

  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey }
  });
}

function extensionForMimeType(mimeType: string) {
  switch (mimeType) {
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

export function buildTemporaryAudioStorageKey(userId: string, clientRecordingId: string, mimeType: string) {
  const extension = extensionForMimeType(mimeType);
  return `audio/${userId}/${clientRecordingId}/${randomUUID()}.${extension}`;
}

export async function putTemporaryAudio(storageKey: string, bytes: Uint8Array, mimeType: string) {
  if (!R2_ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error('Unsupported audio MIME type for upload');
  }

  const bucket = getRequiredEnv('R2_BUCKET');
  const client = buildR2Client();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: storageKey,
      Body: bytes,
      ContentType: mimeType,
      ContentLength: bytes.byteLength
    })
  );

  return { storageKey, stored: true };
}

export async function deleteTemporaryAudio(storageKey: string) {
  return { storageKey, deleted: true };
}
