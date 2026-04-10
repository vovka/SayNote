import { createHash, randomUUID } from 'node:crypto';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { audioFileExtension, toSupportedAudioMimeType } from '../../../shared/audio-mime';

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

type R2ReadFailureKind = 'retryable' | 'terminal';

export class R2ReadError extends Error {
  readonly kind: R2ReadFailureKind;
  readonly code: string;
  readonly safeMessage: string;

  constructor(options: { kind: R2ReadFailureKind; code: string; safeMessage: string; cause?: unknown }) {
    super(options.safeMessage);
    this.name = 'R2ReadError';
    this.kind = options.kind;
    this.code = options.code;
    this.safeMessage = options.safeMessage;
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export function isR2ReadError(error: unknown): error is R2ReadError {
  return error instanceof R2ReadError;
}

function mapR2ReadError(error: unknown) {
  const err = error as { name?: string; message?: string; $retryable?: { throttling?: boolean } };
  const errorName = err?.name ?? 'UnknownR2Error';
  const message = err?.message ?? '';

  if (errorName === 'NoSuchKey' || errorName === 'NotFound') {
    return new R2ReadError({
      kind: 'terminal',
      code: 'OBJECT_NOT_FOUND',
      safeMessage: 'Audio input object was not found in storage',
      cause: error
    });
  }

  if (errorName === 'NoSuchBucket' || errorName === 'InvalidBucketName') {
    return new R2ReadError({
      kind: 'terminal',
      code: 'BUCKET_MISCONFIGURED',
      safeMessage: 'Audio storage bucket is misconfigured',
      cause: error
    });
  }

  const transientName = ['TimeoutError', 'RequestTimeout', 'NetworkingError'];
  const transientMessage = ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'socket hang up'];
  const isTransientTransport =
    transientName.includes(errorName) ||
    transientMessage.some((token) => message.includes(token)) ||
    Boolean(err?.$retryable);

  if (isTransientTransport) {
    return new R2ReadError({
      kind: 'retryable',
      code: 'TRANSPORT_FAILURE',
      safeMessage: 'Audio storage transport failure',
      cause: error
    });
  }

  return new R2ReadError({
    kind: 'retryable',
    code: 'READ_FAILED',
    safeMessage: 'Audio storage read failed',
    cause: error
  });
}

function extensionForMimeType(mimeType: string) {
  return audioFileExtension(mimeType);
}

export function buildTemporaryAudioStorageKey(userId: string, clientRecordingId: string, mimeType: string) {
  const extension = extensionForMimeType(mimeType);
  return `audio/${userId}/${clientRecordingId}/${randomUUID()}.${extension}`;
}

export function buildIdempotentTemporaryAudioStorageKey(userId: string, idempotencyKey: string, mimeType: string) {
  const extension = extensionForMimeType(mimeType);
  const normalizedKey = createHash('sha256').update(idempotencyKey).digest('hex');
  return `audio/${userId}/idempotency/${normalizedKey}.${extension}`;
}

export async function putTemporaryAudio(storageKey: string, bytes: Uint8Array, mimeType: string) {
  const normalizedMimeType = toSupportedAudioMimeType(mimeType);
  if (!normalizedMimeType) {
    throw new Error('Unsupported audio MIME type for upload');
  }

  const bucket = getRequiredEnv('R2_BUCKET');
  const client = buildR2Client();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: storageKey,
      Body: bytes,
      ContentType: normalizedMimeType,
      ContentLength: bytes.byteLength
    })
  );

  return { storageKey, stored: true };
}

export async function getTemporaryAudio(storageKey: string) {
  const bucket = getRequiredEnv('R2_BUCKET');
  const client = buildR2Client();

  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: storageKey
      })
    );

    if (!response.Body) {
      throw new R2ReadError({
        kind: 'retryable',
        code: 'EMPTY_BODY',
        safeMessage: 'Audio storage returned an empty object body'
      });
    }

    const bytes = await response.Body.transformToByteArray();
    return {
      buffer: Buffer.from(bytes),
      contentType: response.ContentType ?? null
    };
  } catch (error) {
    if (isR2ReadError(error)) {
      throw error;
    }
    throw mapR2ReadError(error);
  }
}

export async function deleteTemporaryAudio(storageKey: string) {
  const bucket = getRequiredEnv('R2_BUCKET');
  const client = buildR2Client();
  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: storageKey
    })
  );

  return { storageKey, deleted: true };
}
