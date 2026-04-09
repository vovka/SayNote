export type RecordingVisualState = 'idle' | 'recording-silent' | 'recording-speaking';

export const SPEAKING_LEVEL_ENTER_THRESHOLD = 0.04;
export const EXIT_SPEAKING_LEVEL_THRESHOLD = 0.028;
export const SPEAKING_LEVEL_THRESHOLD = SPEAKING_LEVEL_ENTER_THRESHOLD;
const SMOOTHING_FACTOR = 0.5;
const SMOOTHING_SETTLE_THRESHOLD = 0.002;

function speakingThresholdFor(previousState: RecordingVisualState): number {
  if (previousState === 'recording-speaking') return EXIT_SPEAKING_LEVEL_THRESHOLD;
  return SPEAKING_LEVEL_ENTER_THRESHOLD;
}

export function getRecordingVisualState(
  recording: boolean,
  level: number,
  previousState: RecordingVisualState = 'recording-silent'
): RecordingVisualState {
  if (!recording) return 'idle';
  const threshold = speakingThresholdFor(previousState);
  return level >= threshold ? 'recording-speaking' : 'recording-silent';
}

export function getSmoothedLevel(current: number, target: number) {
  const next = current + (target - current) * SMOOTHING_FACTOR;
  if (Math.abs(next - target) > SMOOTHING_SETTLE_THRESHOLD) return { next, shouldContinue: true };
  return { next: target, shouldContinue: false };
}
