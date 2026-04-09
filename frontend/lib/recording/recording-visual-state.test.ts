import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getRecordingVisualState,
  getSmoothedLevel,
  SPEAKING_LEVEL_THRESHOLD
} from './recording-visual-state.ts';

test('returns idle, silent, and speaking visual states from recording level', () => {
  assert.equal(getRecordingVisualState(false, 0.9), 'idle');
  assert.equal(getRecordingVisualState(true, 0), 'recording-silent');
  assert.equal(getRecordingVisualState(true, SPEAKING_LEVEL_THRESHOLD + 0.01), 'recording-speaking');
});

test('snaps to target when smoothed value reaches threshold', () => {
  const result = getSmoothedLevel(0.1996, 0.2);
  assert.equal(result.shouldContinue, false);
  assert.equal(result.next, 0.2);
});
