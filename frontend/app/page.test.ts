import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getRecordingVisualState,
  getSmoothedLevel,
  SPEAKING_LEVEL_THRESHOLD
} from '../lib/recording/recording-visual-state.ts';

test('recording visual state transitions between idle, silent, and speaking', () => {
  assert.equal(getRecordingVisualState(false, 1), 'idle');
  assert.equal(getRecordingVisualState(true, 0), 'recording-silent');
  assert.equal(getRecordingVisualState(true, SPEAKING_LEVEL_THRESHOLD + 0.01), 'recording-speaking');
});

test('smoothed level snaps to exact target when near threshold', () => {
  const target = 0.2;
  const nearTarget = target - 0.0004;
  const result = getSmoothedLevel(nearTarget, target);

  assert.equal(result.shouldContinue, false);
  assert.equal(result.next, target);
});
