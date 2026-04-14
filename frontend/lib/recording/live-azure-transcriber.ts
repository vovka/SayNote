export interface AzureTokenResponse {
  token: string;
  region: string;
  expiresAt: string;
}

export interface LiveAzureCallbacks {
  onRecognizing: (interim: string) => void;
  onRecognized: (finalSegment: string) => void;
  onCanceled: (reason: { code?: string; errorDetails?: string }) => void;
  onSessionStopped: () => void;
}

interface LiveAzureTranscriberOptions {
  language: string;
  fetchToken: () => Promise<AzureTokenResponse>;
  callbacks: LiveAzureCallbacks;
}

export class LiveAzureTranscriber {
  private readonly options: LiveAzureTranscriberOptions;
  private recognizer: import('microsoft-cognitiveservices-speech-sdk').SpeechRecognizer | null = null;
  private tokenRefreshTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: LiveAzureTranscriberOptions) {
    this.options = options;
  }

  async start(): Promise<void> {
    const sdk = await import('microsoft-cognitiveservices-speech-sdk');
    const tokenData = await this.options.fetchToken();

    const speechConfig = sdk.SpeechConfig.fromAuthorizationToken(tokenData.token, tokenData.region);
    speechConfig.speechRecognitionLanguage = this.options.language;

    const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
    this.recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

    this.scheduleTokenRefresh(tokenData.expiresAt);
    this.attachHandlers();

    await new Promise<void>((resolve, reject) => {
      this.recognizer!.startContinuousRecognitionAsync(resolve, reject);
    });
  }

  stop(): Promise<void> {
    this.clearTokenRefresh();
    return new Promise<void>((resolve) => {
      if (!this.recognizer) {
        resolve();
        return;
      }

      const originalHandler = this.options.callbacks.onSessionStopped;
      this.options.callbacks.onSessionStopped = () => {
        originalHandler();
        resolve();
      };

      this.recognizer.stopContinuousRecognitionAsync(
        () => { /* session stopped event will fire next */ },
        () => { /* close even on error */ this.close(); resolve(); }
      );
    });
  }

  cancel(): Promise<void> {
    this.clearTokenRefresh();
    return new Promise<void>((resolve) => {
      if (!this.recognizer) {
        resolve();
        return;
      }
      this.recognizer.stopContinuousRecognitionAsync(
        () => { this.close(); resolve(); },
        () => { this.close(); resolve(); }
      );
    });
  }

  private attachHandlers() {
    if (!this.recognizer) return;

    this.recognizer.recognizing = (_sender, event) => {
      this.options.callbacks.onRecognizing(event.result.text ?? '');
    };

    this.recognizer.recognized = (_sender, event) => {
      const sdk_ResultReason = event.result.reason;
      // 3 = RecognizedSpeech
      if (sdk_ResultReason === 3 && event.result.text) {
        this.options.callbacks.onRecognized(event.result.text);
      }
    };

    this.recognizer.canceled = (_sender, event) => {
      this.options.callbacks.onCanceled({
        code: String(event.errorCode),
        errorDetails: event.errorDetails
      });
    };

    this.recognizer.sessionStopped = () => {
      this.close();
      this.options.callbacks.onSessionStopped();
    };
  }

  private scheduleTokenRefresh(expiresAt: string) {
    const expiresMs = new Date(expiresAt).getTime();
    const refreshAt = expiresMs - 60_000;
    const delay = refreshAt - Date.now();
    if (delay <= 0) return;

    this.tokenRefreshTimer = setTimeout(() => {
      void this.refreshToken();
    }, delay);
  }

  private async refreshToken() {
    try {
      const tokenData = await this.options.fetchToken();
      if (this.recognizer) {
        this.recognizer.authorizationToken = tokenData.token;
      }
      this.scheduleTokenRefresh(tokenData.expiresAt);
    } catch {
      // non-fatal; Azure will cancel the session if token truly expires
    }
  }

  private clearTokenRefresh() {
    if (this.tokenRefreshTimer !== null) {
      clearTimeout(this.tokenRefreshTimer);
      this.tokenRefreshTimer = null;
    }
  }

  private close() {
    if (this.recognizer) {
      this.recognizer.close();
      this.recognizer = null;
    }
  }
}
