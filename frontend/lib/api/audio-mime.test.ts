import test from 'node:test';
import assert from 'node:assert/strict';
import {
  audioFileExtension,
  normalizeAudioMimeType,
  toSupportedAudioMimeType
} from '../../../shared/audio-mime.ts';

test('normalizeAudioMimeType strips parameters and normalizes aliases', () => {
  assert.equal(normalizeAudioMimeType('audio/webm;codecs=opus'), 'audio/webm');
  assert.equal(normalizeAudioMimeType('audio/x-wav'), 'audio/wav');
});

test('audio MIME helpers map supported uploads consistently', () => {
  assert.equal(toSupportedAudioMimeType('audio/webm;codecs=opus'), 'audio/webm');
  assert.equal(audioFileExtension('audio/webm;codecs=opus'), 'webm');
  assert.equal(audioFileExtension('audio/mp3'), 'mp3');
});
