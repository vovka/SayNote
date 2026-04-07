import test from 'node:test';
import assert from 'node:assert/strict';
import { S3Client } from '@aws-sdk/client-s3';
import { getTemporaryAudio, isR2ReadError } from './r2.ts';

const ORIGINAL_SEND = S3Client.prototype.send;

function setStorageEnv() {
  process.env.R2_ACCOUNT_ID = 'test-account';
  process.env.R2_ACCESS_KEY_ID = 'test-key';
  process.env.R2_SECRET_ACCESS_KEY = 'test-secret';
  process.env.R2_BUCKET = 'test-bucket';
}

test.afterEach(() => {
  S3Client.prototype.send = ORIGINAL_SEND;
});

test('getTemporaryAudio returns audio buffer and content type', async () => {
  setStorageEnv();
  S3Client.prototype.send = async () =>
    ({
      Body: {
        transformToByteArray: async () => new Uint8Array([1, 2, 3])
      },
      ContentType: 'audio/webm'
    }) as never;

  const audio = await getTemporaryAudio('audio/user/recording.webm');
  assert.deepEqual([...audio.buffer], [1, 2, 3]);
  assert.equal(audio.contentType, 'audio/webm');
});

test('getTemporaryAudio maps missing object to terminal R2ReadError', async () => {
  setStorageEnv();
  S3Client.prototype.send = async () => {
    const error = new Error('Not found');
    (error as Error & { name: string }).name = 'NoSuchKey';
    throw error;
  };

  await assert.rejects(
    () => getTemporaryAudio('audio/missing.webm'),
    (error: unknown) => {
      assert.equal(isR2ReadError(error), true);
      assert.equal((error as { kind: string }).kind, 'terminal');
      assert.equal((error as { code: string }).code, 'OBJECT_NOT_FOUND');
      return true;
    }
  );
});

test('getTemporaryAudio maps transport failures to retryable R2ReadError', async () => {
  setStorageEnv();
  S3Client.prototype.send = async () => {
    const error = new Error('socket hang up');
    (error as Error & { name: string }).name = 'TimeoutError';
    throw error;
  };

  await assert.rejects(
    () => getTemporaryAudio('audio/transient.webm'),
    (error: unknown) => {
      assert.equal(isR2ReadError(error), true);
      assert.equal((error as { kind: string }).kind, 'retryable');
      assert.equal((error as { code: string }).code, 'TRANSPORT_FAILURE');
      return true;
    }
  );
});
