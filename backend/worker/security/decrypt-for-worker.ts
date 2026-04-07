import { createDecipheriv, createHash } from 'node:crypto';

const INSECURE_DEFAULT_MASTER_KEY = 'dev-only-master-key-change-me';

function assertMasterKeySafety(secret: string | undefined) {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const isDevelopmentRuntime = nodeEnv === 'development' || nodeEnv === 'test';

  if (!secret || secret.trim().length === 0) {
    if (isDevelopmentRuntime) {
      return INSECURE_DEFAULT_MASTER_KEY;
    }
    throw new Error('ENCRYPTION_MASTER_KEY must be configured in non-development runtimes.');
  }

  if (secret === INSECURE_DEFAULT_MASTER_KEY) {
    throw new Error('ENCRYPTION_MASTER_KEY is set to an insecure default. Refusing to start.');
  }

  return secret;
}

function getKey() {
  const secret = assertMasterKeySafety(process.env.ENCRYPTION_MASTER_KEY);
  return createHash('sha256').update(secret).digest();
}

export async function decryptSecretForWorker(ciphertextBase64: string) {
  const input = Buffer.from(ciphertextBase64, 'base64');
  const iv = input.subarray(0, 12);
  const tag = input.subarray(12, 28);
  const ciphertext = input.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
