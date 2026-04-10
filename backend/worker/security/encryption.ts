import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const LEGACY_DEV_FALLBACK_KEY = 'dev-only-master-key-change-me';
const ENVELOPE_VERSION = 'v1';
const MIN_MASTER_KEY_LENGTH = 32;

interface EncryptionEnvelopeV1 {
  v: 'v1';
  iv: string;
  tag: string;
  ciphertext: string;
}

function isLocalDevelopmentEnvironment(env: NodeJS.ProcessEnv) {
  const nodeEnv = env.NODE_ENV?.toLowerCase();
  return nodeEnv === 'development' || nodeEnv === 'test';
}

function hasMinimumEntropy(secret: string) {
  const uniqueChars = new Set(secret).size;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z\d]/].filter((pattern) => pattern.test(secret)).length;
  return uniqueChars >= 10 && classes >= 3;
}

export function validateMasterKeyConfig(env: NodeJS.ProcessEnv): { valid: true } {
  const configured = env.ENCRYPTION_MASTER_KEY;
  const isLocalDev = isLocalDevelopmentEnvironment(env);

  if (!configured) {
    if (isLocalDev) {
      return { valid: true };
    }
    throw new Error('ENCRYPTION_MASTER_KEY is required outside local development/test environments');
  }

  if (!isLocalDev && configured === LEGACY_DEV_FALLBACK_KEY) {
    throw new Error('ENCRYPTION_MASTER_KEY cannot use the development fallback value in non-local environments');
  }

  if (configured.length < MIN_MASTER_KEY_LENGTH) {
    throw new Error(`ENCRYPTION_MASTER_KEY must be at least ${MIN_MASTER_KEY_LENGTH} characters long`);
  }

  if (!hasMinimumEntropy(configured)) {
    throw new Error('ENCRYPTION_MASTER_KEY does not meet entropy requirements (needs mixed character classes and sufficient uniqueness)');
  }

  return { valid: true };
}

function getMasterSecret() {
  validateMasterKeyConfig(process.env);
  return process.env.ENCRYPTION_MASTER_KEY ?? LEGACY_DEV_FALLBACK_KEY;
}

function getKey() {
  return createHash('sha256').update(getMasterSecret()).digest();
}

export function ensureEncryptionReady() {
  validateMasterKeyConfig(process.env);
}

function encodeEnvelopeV1(input: EncryptionEnvelopeV1) {
  return `${ENVELOPE_VERSION}:${Buffer.from(JSON.stringify(input), 'utf8').toString('base64')}`;
}

function decodeEnvelopeV1(serialized: string): EncryptionEnvelopeV1 {
  const [, payload] = serialized.split(':', 2);
  if (!payload) {
    throw new Error('Encrypted secret envelope payload was missing');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
  } catch {
    throw new Error('Encrypted secret envelope payload was invalid');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Encrypted secret envelope payload must be an object');
  }

  const envelope = parsed as Partial<EncryptionEnvelopeV1>;
  if (envelope.v !== 'v1' || !envelope.iv || !envelope.tag || !envelope.ciphertext) {
    throw new Error('Encrypted secret envelope payload was missing required fields');
  }

  return envelope as EncryptionEnvelopeV1;
}

export async function encryptSecret(plaintext: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return encodeEnvelopeV1({
    v: 'v1',
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: encrypted.toString('base64')
  });
}

function decryptLegacySecret(ciphertextBase64: string) {
  const input = Buffer.from(ciphertextBase64, 'base64');
  if (input.length < 28) {
    throw new Error('Invalid legacy ciphertext: insufficient length');
  }

  const iv = input.subarray(0, 12);
  const tag = input.subarray(12, 28);
  const ciphertext = input.subarray(28);

  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

function decryptEnvelopeV1(serialized: string) {
  const envelope = decodeEnvelopeV1(serialized);
  const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(envelope.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]).toString('utf8');
}

export async function decryptSecret(storedCiphertext: string) {
  if (storedCiphertext.startsWith(`${ENVELOPE_VERSION}:`)) {
    return decryptEnvelopeV1(storedCiphertext);
  }

  return decryptLegacySecret(storedCiphertext);
}
