import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cancelRecording,
  setAudioLevelMeterFactoryForTest,
  startRecording,
  stopRecording,
  subscribeToRecordingLevel
} from './media-recorder.ts';

type RecorderEvent = { data: Blob };

class FakeMediaRecorder {
  static isTypeSupported(value: string) {
    return value.includes('webm');
  }

  mimeType = 'audio/webm';
  state: 'inactive' | 'recording' = 'inactive';
  ondataavailable: ((event: RecorderEvent) => void) | null = null;
  onstop: (() => void) | null = null;

  start() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['audio']) });
    this.onstop?.();
  }
}

function installRecorderMocks() {
  const track = { stopCalled: 0, stop() { this.stopCalled += 1; } };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  const originalMediaRecorder = globalThis.MediaRecorder;
  const originalNavigator = globalThis.navigator;

  Object.defineProperty(globalThis, 'MediaRecorder', {
    configurable: true,
    value: FakeMediaRecorder
  });

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { mediaDevices: { getUserMedia: async () => stream } }
  });

  return {
    track,
    restore() {
      Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, value: originalMediaRecorder });
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: originalNavigator });
    }
  };
}

test('recording flow starts meter, forwards level updates, and stops meter on stop', async () => {
  const mockState = { startCalls: 0, stopCalls: 0, unsubscribeCalls: 0, listener: null as ((level: number) => void) | null };
  const env = installRecorderMocks();

  setAudioLevelMeterFactoryForTest(() => ({
    start: () => { mockState.startCalls += 1; },
    stop: () => { mockState.stopCalls += 1; },
    subscribe: (listener) => {
      mockState.listener = listener;
      return () => { mockState.unsubscribeCalls += 1; };
    }
  }));

  const levels: number[] = [];
  const unsubscribe = subscribeToRecordingLevel((value) => levels.push(value));

  try {
    await startRecording();
    mockState.listener?.(0.42);
    const payload = await stopRecording();

    assert.equal(payload?.mimeType, 'audio/webm');
    assert.equal(mockState.startCalls, 1);
    assert.equal(mockState.stopCalls, 1);
    assert.equal(mockState.unsubscribeCalls, 1);
    assert.deepEqual(levels, [0.42]);
    assert.equal(env.track.stopCalled, 1);
  } finally {
    unsubscribe();
    env.restore();
    setAudioLevelMeterFactoryForTest(null);
  }
});

test('recording cancel stops meter lifecycle and media tracks', async () => {
  const mockState = { stopCalls: 0 };
  const env = installRecorderMocks();

  setAudioLevelMeterFactoryForTest(() => ({
    start: () => undefined,
    stop: () => { mockState.stopCalls += 1; },
    subscribe: () => () => undefined
  }));

  try {
    await startRecording();
    await cancelRecording();
    assert.equal(mockState.stopCalls, 1);
    assert.equal(env.track.stopCalled, 1);
  } finally {
    env.restore();
    setAudioLevelMeterFactoryForTest(null);
  }
});
