let activeRecorder: MediaRecorder | null = null;
let activeStream: MediaStream | null = null;
let chunks: BlobPart[] = [];
let startedAt = 0;

export async function startRecording() {
  activeStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  activeRecorder = new MediaRecorder(activeStream, { mimeType: 'audio/webm' });
  chunks = [];
  startedAt = Date.now();

  activeRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  activeRecorder.start();
}

export async function stopRecording() {
  if (!activeRecorder) return null;

  await new Promise<void>((resolve) => {
    activeRecorder!.onstop = () => resolve();
    activeRecorder!.stop();
  });

  const blob = new Blob(chunks, { type: 'audio/webm' });
  activeStream?.getTracks().forEach((track) => track.stop());
  activeStream = null;
  activeRecorder = null;

  return {
    audioBlob: blob,
    mimeType: blob.type,
    durationMs: Date.now() - startedAt,
    createdAt: new Date().toISOString()
  };
}
