export type RecordingVisualState = 'idle' | 'recording-silent' | 'recording-speaking';

export const SPEAKING_LEVEL_THRESHOLD = 0.08;

export function getRecordingVisualState(recording: boolean, level: number): RecordingVisualState {
  if (!recording) return 'idle';
  return level > SPEAKING_LEVEL_THRESHOLD ? 'recording-speaking' : 'recording-silent';
}

export function getSmoothedLevel(current: number, target: number) {
  const next = current + (target - current) * 0.35;
  if (Math.abs(next - target) > 0.001) return { next, shouldContinue: true };
  return { next: target, shouldContinue: false };
}
