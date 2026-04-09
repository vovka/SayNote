import { createAudioLevelMeter, type AudioLevelMeter } from './audio-level-meter';

export type RecordingLevelListener = (level: number) => void;

let activeRecorder: MediaRecorder | null = null;
let activeStream: MediaStream | null = null;
let activeMeter: AudioLevelMeter | null = null;
let activeMeterUnsubscribe: (() => void) | null = null;
let activeMimeType = '';
let chunks: BlobPart[] = [];
let startedAt = 0;
const levelListeners = new Set<RecordingLevelListener>();

const MIME_TYPE_PREFERENCES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'] as const;

let createMeter = createAudioLevelMeter;

export function setAudioLevelMeterFactoryForTest(factory: typeof createAudioLevelMeter | null) {
  createMeter = factory ?? createAudioLevelMeter;
}

function pickSupportedMimeType() {
  if (typeof MediaRecorder.isTypeSupported !== 'function') return '';
  return MIME_TYPE_PREFERENCES.find((value) => MediaRecorder.isTypeSupported(value)) ?? '';
}

function notifyLevel(level: number) {
  levelListeners.forEach((listener) => listener(level));
}

function stopActiveTracks() {
  activeStream?.getTracks().forEach((track) => track.stop());
  activeStream = null;
}

function stopActiveMeter() {
  activeMeterUnsubscribe?.();
  activeMeter?.stop();
  activeMeterUnsubscribe = null;
  activeMeter = null;
}

function resetRecorderState() {
  stopActiveMeter();
  activeRecorder = null;
  activeMimeType = '';
  chunks = [];
}

function buildStartRecordingError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Recording is unavailable on this device';
  return new Error(`Unable to start recording: ${message}`);
}

export function subscribeToRecordingLevel(listener: RecordingLevelListener) {
  levelListeners.add(listener);
  return () => levelListeners.delete(listener);
}

export async function startRecording() {
  let stream: MediaStream | null = null;

  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = pickSupportedMimeType();
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

    activeStream = stream;
    activeRecorder = recorder;
    activeMimeType = recorder.mimeType || mimeType;
    activeMeter = createMeter(stream);
    activeMeterUnsubscribe = activeMeter.subscribe(notifyLevel);
    activeMeter?.start();
    chunks = [];
    startedAt = Date.now();

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    recorder.start();
  } catch (error) {
    stream?.getTracks().forEach((track) => track.stop());
    stopActiveTracks();
    resetRecorderState();
    throw buildStartRecordingError(error);
  }
}

async function stopRecorder(recorder: MediaRecorder) {
  if (recorder.state === 'inactive') return;
  await new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
    recorder.stop();
  });
}

export async function cancelRecording() {
  const recorder = activeRecorder;
  if (!recorder) return;
  await stopRecorder(recorder);
  stopActiveTracks();
  resetRecorderState();
}

export async function stopRecording() {
  const recorder = activeRecorder;
  if (!recorder) return null;

  await stopRecorder(recorder);
  const mimeType = recorder.mimeType || activeMimeType || 'audio/webm';
  const blob = new Blob(chunks, { type: mimeType });
  stopActiveTracks();
  resetRecorderState();

  return {
    audioBlob: blob,
    mimeType: blob.type,
    durationMs: Date.now() - startedAt,
    createdAt: new Date().toISOString()
  };
}
