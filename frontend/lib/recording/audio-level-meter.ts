export type LevelListener = (level: number) => void;

export type AudioLevelMeter = {
  start: () => void;
  stop: () => void;
  subscribe: (listener: LevelListener) => () => void;
};

const FRAME_SMOOTHING = 0.25;
const FFT_SIZE = 1024;

function toRmsLevel(buffer: Uint8Array) {
  const meanSquare = buffer.reduce((sum, value) => {
    const centered = (value - 128) / 128;
    return sum + centered * centered;
  }, 0) / buffer.length;

  return Math.min(1, Math.sqrt(meanSquare));
}

export function createAudioLevelMeter(stream: MediaStream): AudioLevelMeter {
  const context = new AudioContext();
  const analyser = context.createAnalyser();
  const source = context.createMediaStreamSource(stream);
  const listeners = new Set<LevelListener>();
  const samples = new Uint8Array(FFT_SIZE);
  let animationFrame = 0;
  let running = false;
  let smoothedLevel = 0;

  analyser.fftSize = FFT_SIZE;
  source.connect(analyser);

  const emit = (level: number) => listeners.forEach((listener) => listener(level));

  const updateLevel = () => {
    if (!running) return;
    analyser.getByteTimeDomainData(samples);
    const level = toRmsLevel(samples);
    smoothedLevel += (level - smoothedLevel) * FRAME_SMOOTHING;
    emit(smoothedLevel);
    animationFrame = requestAnimationFrame(updateLevel);
  };

  return {
    start() {
      if (running) return;
      running = true;
      animationFrame = requestAnimationFrame(updateLevel);
    },
    stop() {
      running = false;
      if (animationFrame) cancelAnimationFrame(animationFrame);
      source.disconnect();
      analyser.disconnect();
      void context.close();
      emit(0);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}
