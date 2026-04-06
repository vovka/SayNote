import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

function getKey() {
  const secret = process.env.ENCRYPTION_MASTER_KEY ?? 'dev-only-master-key-change-me';
  return createHash('sha256').update(secret).digest();
}

export async function encryptSecret(plaintext: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export async function decryptSecret(ciphertextBase64: string) {
  const input = Buffer.from(ciphertextBase64, 'base64');
  const iv = input.subarray(0, 12);
  const tag = input.subarray(12, 28);
  const ciphertext = input.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
