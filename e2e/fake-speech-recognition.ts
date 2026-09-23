/**
 * Chromium (via Playwright) doesn't implement the SpeechRecognition API, so
 * real speech input can't be exercised in E2E. This script is injected into
 * the page before any app code runs and replaces `window.SpeechRecognition`
 * with a fake the test can drive directly: `window.__recognitions` collects
 * every instance created, in creation order, so a test can grab the most
 * recently created one (i.e. whichever language the app just activated) and
 * fire a synthetic "final result" event on it via `page.evaluate`.
 */
export const FAKE_SPEECH_RECOGNITION_INIT_SCRIPT = `
  class FakeSpeechRecognition {
    constructor() {
      this.lang = "";
      this.continuous = false;
      this.interimResults = false;
      this.onresult = null;
      this.onerror = null;
      this.onend = null;
      this.onstart = null;
      window.__recognitions.push(this);
    }
    start() {
      this.onstart && this.onstart();
    }
    stop() {
      this.onend && this.onend();
    }
    abort() {}
  }
  window.__recognitions = [];
  window.SpeechRecognition = FakeSpeechRecognition;
  window.webkitSpeechRecognition = FakeSpeechRecognition;
`;

/** Shape of a synthetic result event fired on a fake recognizer. */
export interface FakeSpeechResultEvent {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }> & { isFinal: boolean }>;
}

/** One fake recognizer instance, as created by the init script above. */
export interface FakeSpeechRecognition {
  lang: string;
  onresult: ((event: FakeSpeechResultEvent) => void) | null;
}

/** `window` once the init script has run. */
export interface WindowWithFakeRecognitions {
  __recognitions: FakeSpeechRecognition[];
}
