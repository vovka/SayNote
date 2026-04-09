import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('recording flow chooses a supported MIME type and handles microphone startup failures', async () => {
  const recorderSource = await readFile(new URL('./media-recorder.ts', import.meta.url), 'utf8');
  const pageSource = await readFile(new URL('../../app/page.tsx', import.meta.url), 'utf8');

  assert.match(recorderSource, /MediaRecorder\.isTypeSupported/);
  assert.match(recorderSource, /try \{\s*stream = await navigator\.mediaDevices\.getUserMedia\(\{ audio: true \}\);/);
  assert.match(recorderSource, /throw buildStartRecordingError\(error\);/);
  assert.match(pageSource, /try \{\s*await startRecording\(\);[\s\S]*setStatus\('Recording'\);[\s\S]*\} catch \{/);
  assert.match(pageSource, /setStatus\('Microphone access denied or unavailable'\)/);
});

test('recording flow starts and disposes the audio level meter lifecycle', async () => {
  const recorderSource = await readFile(new URL('./media-recorder.ts', import.meta.url), 'utf8');

  assert.match(recorderSource, /createAudioLevelMeter\(stream\)/);
  assert.match(recorderSource, /activeMeter\?\.start\(\)/);
  assert.match(recorderSource, /activeMeter\?\.stop\(\)/);
  assert.match(recorderSource, /function subscribeToRecordingLevel\(listener: RecordingLevelListener\)/);
});
