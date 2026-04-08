let activeRecorder: MediaRecorder | null = null;
let activeStream: MediaStream | null = null;
let activeMimeType = '';
let chunks: BlobPart[] = [];
let startedAt = 0;

const MIME_TYPE_PREFERENCES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'] as const;

function pickSupportedMimeType() {
  if (typeof MediaRecorder.isTypeSupported !== 'function') return '';
  return MIME_TYPE_PREFERENCES.find((value) => MediaRecorder.isTypeSupported(value)) ?? '';
}

function stopActiveTracks() {
  activeStream?.getTracks().forEach((track) => track.stop());
  activeStream = null;
}

function resetRecorderState() {
  activeRecorder = null;
  activeMimeType = '';
  chunks = [];
}

function buildStartRecordingError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Recording is unavailable on this device';
  return new Error(`Unable to start recording: ${message}`);
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

export async function stopRecording() {
  const recorder = activeRecorder;
  if (!recorder) return null;

  await new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
    recorder.stop();
  });

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
