import type { RecordingVisualState } from './recording-visual-state.ts';

type RecordingButtonStyle = {
  scale: number;
  glowRadius: number;
  glowOpacity: number;
  ringSpread: number;
  ringOpacity: number;
  saturation: number;
  brightness: number;
  pulseDurationMs: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const norm = (level: number, floor: number, cap: number) => clamp((level - floor) / (cap - floor), 0, 1);

export function getRecordingButtonStyle(state: RecordingVisualState, level: number): RecordingButtonStyle {
  if (state === 'idle') return idleStyle();
  if (state === 'recording-silent') return silentStyle();
  return speakingStyle(level);
}

function idleStyle(): RecordingButtonStyle {
  return { scale: 1, glowRadius: 8, glowOpacity: 0.32, ringSpread: 0, ringOpacity: 0, saturation: 1, brightness: 1, pulseDurationMs: 0 };
}

function silentStyle(): RecordingButtonStyle {
  return { scale: 1.03, glowRadius: 24, glowOpacity: 0.5, ringSpread: 12, ringOpacity: 0.32, saturation: 1.12, brightness: 1.08, pulseDurationMs: 2200 };
}

function speakingStyle(level: number): RecordingButtonStyle {
  const intensity = norm(level, 0.05, 0.9);
  return {
    scale: round(1.08 + intensity * 0.18),
    glowRadius: Math.round(36 + intensity * 36),
    glowOpacity: round(0.58 + intensity * 0.3),
    ringSpread: Math.round(16 + intensity * 22),
    ringOpacity: round(0.42 + intensity * 0.34),
    saturation: round(1.28 + intensity * 0.28),
    brightness: round(1.12 + intensity * 0.18),
    pulseDurationMs: 900
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
