import test from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { decryptSecret, encryptSecret, validateMasterKeyConfig } from './encryption.ts';

function makeLegacyCiphertext(plaintext: string, secret: string) {
  const key = createHash('sha256').update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

test('encryptSecret/decryptSecret performs versioned roundtrip', async () => {
  process.env.NODE_ENV = 'test';
  process.env.ENCRYPTION_MASTER_KEY = 'TestMasterKey-LongEnough-1234567890!';

  const ciphertext = await encryptSecret('super-secret-key-value');
  assert.ok(ciphertext.startsWith('v1:'));

  const plaintext = await decryptSecret(ciphertext);
  assert.equal(plaintext, 'super-secret-key-value');
});

test('decryptSecret supports legacy ciphertext format', async () => {
  process.env.NODE_ENV = 'test';
  process.env.ENCRYPTION_MASTER_KEY = 'TestMasterKey-LongEnough-1234567890!';

  const legacy = makeLegacyCiphertext('legacy-value', process.env.ENCRYPTION_MASTER_KEY);
  const plaintext = await decryptSecret(legacy);
  assert.equal(plaintext, 'legacy-value');
});

test('validateMasterKeyConfig rejects missing keys outside local development', async () => {
  assert.throws(
    () => validateMasterKeyConfig({ NODE_ENV: 'production' } as NodeJS.ProcessEnv),
    /ENCRYPTION_MASTER_KEY is required/
  );
});

test('validateMasterKeyConfig rejects weak key values', async () => {
  assert.throws(
    () => validateMasterKeyConfig({ NODE_ENV: 'production', ENCRYPTION_MASTER_KEY: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' } as NodeJS.ProcessEnv),
    /entropy requirements/
  );
});
