import test from 'node:test';
import assert from 'node:assert/strict';
import { scrubSensitiveFields } from './safe-logging.ts';

test('scrubSensitiveFields redacts nested key material', async () => {
  const input = {
    provider: 'groq',
    apiKey: 'secret-key',
    nested: {
      Authorization: 'Bearer abc123',
      token: 'abc',
      safe: 'ok'
    },
    arr: [{ password: 'p@ss' }, { value: 'x' }]
  };

  const output = scrubSensitiveFields(input) as Record<string, unknown>;
  assert.equal(output.apiKey, '[REDACTED]');
  assert.equal((output.nested as Record<string, unknown>).Authorization, '[REDACTED]');
  assert.equal((output.nested as Record<string, unknown>).token, '[REDACTED]');
  assert.equal((output.nested as Record<string, unknown>).safe, 'ok');

  const arr = output.arr as Array<Record<string, unknown>>;
  assert.equal(arr[0].password, '[REDACTED]');
  assert.equal(arr[1].value, 'x');
});
