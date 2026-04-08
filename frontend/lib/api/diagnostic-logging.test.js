import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('api diagnostics keep error details and classify route failures', async () => {
  const safeLogging = await readFile(new URL('./safe-logging.ts', import.meta.url), 'utf8');
  const uploadRoute = await readFile(new URL('../../app/api/audio/upload/route.ts', import.meta.url), 'utf8');
  const credentialsRoute = await readFile(
    new URL('../../app/api/settings/ai-credentials/route.ts', import.meta.url),
    'utf8'
  );

  assert.match(safeLogging, /message:\s*error\.message/);
  assert.match(safeLogging, /stack:\s*error\.stack/);
  assert.match(uploadRoute, /\[audio_upload_r2_put_failed\]/);
  assert.match(uploadRoute, /\[audio_upload_db_create_failed\]/);
  assert.match(credentialsRoute, /errorCode:\s*'AI_CREDENTIAL_UPDATE_FAILED'/);
  assert.match(credentialsRoute, /status:\s*500/);
});
