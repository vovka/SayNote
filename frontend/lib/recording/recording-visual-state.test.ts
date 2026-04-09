import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXIT_SPEAKING_LEVEL_THRESHOLD,
  SPEAKING_LEVEL_ENTER_THRESHOLD,
  SPEAKING_LEVEL_THRESHOLD,
  getRecordingVisualState,
  getSmoothedLevel
} from './recording-visual-state.ts';
import { toRmsLevel } from './audio-level-meter.ts';

function rmsLevelForOffset(offset: number) {
  return toRmsLevel(new Uint8Array(1024).fill(128 + offset));
}

test('returns idle, silent, and speaking visual states from recording level', () => {
  assert.equal(getRecordingVisualState(false, 0.9), 'idle');
  assert.equal(getRecordingVisualState(true, 0), 'recording-silent');
  assert.equal(getRecordingVisualState(true, SPEAKING_LEVEL_THRESHOLD + 0.01), 'recording-speaking');
});

test('enters speaking state for ordinary low-level speech values from rms meter scale', () => {
  const quietSpeechLevel = rmsLevelForOffset(6);
  assert.ok(quietSpeechLevel >= SPEAKING_LEVEL_ENTER_THRESHOLD);
  assert.equal(getRecordingVisualState(true, quietSpeechLevel, 'recording-silent'), 'recording-speaking');
});

test('uses hysteresis to avoid flicker near the speaking boundary', () => {
  const speakingLevel = rmsLevelForOffset(6);
  const nearBoundaryLevel = rmsLevelForOffset(4);

  assert.equal(getRecordingVisualState(true, speakingLevel, 'recording-silent'), 'recording-speaking');
  assert.ok(nearBoundaryLevel > EXIT_SPEAKING_LEVEL_THRESHOLD);
  assert.equal(getRecordingVisualState(true, nearBoundaryLevel, 'recording-speaking'), 'recording-speaking');
  assert.equal(getRecordingVisualState(true, EXIT_SPEAKING_LEVEL_THRESHOLD - 0.001, 'recording-speaking'), 'recording-silent');
});

test('snaps to target when smoothed value reaches threshold', () => {
  const result = getSmoothedLevel(0.1987, 0.2);
  assert.equal(result.shouldContinue, false);
  assert.equal(result.next, 0.2);
});
