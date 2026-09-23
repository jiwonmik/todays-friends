"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type CaptionLang = "ko-KR" | "zh-CN";

interface UseSpeechCaptionOptions {
  lang: CaptionLang;
  active: boolean;
  onFinalResult: (text: string) => void;
}

interface UseSpeechCaptionResult {
  interimText: string;
  supported: boolean;
  error: string | null;
  /**
   * True only once Chrome has actually started recognizing (i.e. the mic
   * permission prompt, if any, was resolved and audio capture began).
   * `active` alone flips as soon as the caller asks for recognition to
   * start, which can be well before that — the gap is exactly the window
   * where a permission prompt is pending, so callers should show a
   * distinct "connecting" state rather than treating `active` as "live".
   */
  listening: boolean;
  /**
   * End the current utterance now instead of waiting for Chrome to notice
   * the silence — whatever was said so far goes out through
   * `onFinalResult` right away, and listening resumes immediately after.
   * No-op when nothing is being recognized.
   */
  finalizeNow: () => void;
}

function getRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

// Errors after which Chrome won't succeed on retry without the user fixing
// something first (permission, hardware, connectivity) — auto-restarting
// against these just spams the same failure.
const FATAL_ERROR_CODES = new Set([
  "not-allowed",
  "service-not-allowed",
  "audio-capture",
  "network",
]);

// How long to wait after Chrome stops recognition (silence) before
// restarting it, rather than restarting instantly.
const RESTART_DELAY_MS = 3000;

function describeSpeechError(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "마이크 권한이 차단되어 있습니다. 주소창의 자물쇠(또는 사이트 정보) 아이콘에서 마이크 권한을 허용한 뒤 새로고침해주세요.";
    case "audio-capture":
      return "마이크를 찾을 수 없습니다. 마이크가 연결되어 있는지 확인해주세요.";
    case "network":
      return "네트워크 오류로 음성 인식에 실패했습니다. 연결 상태를 확인해주세요.";
    default:
      return `음성 인식 오류: ${code}`;
  }
}

export function useSpeechCaption({
  lang,
  active,
  onFinalResult,
}: UseSpeechCaptionOptions): UseSpeechCaptionResult {
  const [interimText, setInterimText] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Assume supported until the client-only check in the effect below proves
  // otherwise — computing this from `window` during render would make the
  // server-rendered HTML (no window) diverge from the client's first paint
  // and trigger a hydration mismatch.
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const onFinalResultRef = useRef(onFinalResult);
  // Set by the active recognition effect; null while not listening.
  const finalizeNowRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    onFinalResultRef.current = onFinalResult;
  }, [onFinalResult]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-only capability check, deliberately deferred out of render to avoid a hydration mismatch
    setSupported(getRecognitionConstructor() !== null);
  }, []);

  useEffect(() => {
    if (!active) return;
    const Constructor = getRecognitionConstructor();
    if (!Constructor) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- same client-only capability check, scoped to this effect's active branch
      setError("이 브라우저는 음성 인식을 지원하지 않습니다. Chrome을 사용해주세요.");
      return;
    }

    const recognition = new Constructor();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;
    let hadFatalError = false;
    let restartTimeoutId: ReturnType<typeof setTimeout> | null = null;
    // Latest not-yet-final text. While a finalizeNow() stop is in flight,
    // `manualStop` is set and `pendingManualFinal` holds the text to fall
    // back on if Chrome stops without producing a final result for it
    // (cleared once a real final result arrives).
    let latestInterim = "";
    let manualStop = false;
    let pendingManualFinal: string | null = null;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) {
          const trimmed = text.trim();
          if (trimmed) onFinalResultRef.current(trimmed);
          pendingManualFinal = null;
        } else {
          interim += text;
        }
      }
      latestInterim = interim;
      setInterimText(interim);
    };

    recognition.onstart = () => {
      setListening(true);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      if (FATAL_ERROR_CODES.has(event.error)) {
        hadFatalError = true;
        setListening(false);
      }
      setError(describeSpeechError(event.error));
    };

    // Chrome stops recognition after silence; restart automatically after a
    // short delay while active, unless it stopped because of an
    // unrecoverable error (e.g. the mic permission was denied) — retrying
    // that just repeats the same error. `listening` drops to false for the
    // gap so the UI shows "connecting" rather than implying it's still
    // capturing audio during the wait.
    // A finalizeNow() stop is the user asking to move on, not silence — so
    // it restarts right away, and keeps `listening` true through the brief
    // restart so the UI doesn't flash the "connecting" state.
    recognition.onend = () => {
      const manual = manualStop;
      manualStop = false;
      if (pendingManualFinal) {
        // Chrome stopped without finalizing what was on screen — use it as is.
        onFinalResultRef.current(pendingManualFinal);
      }
      pendingManualFinal = null;
      latestInterim = "";
      setInterimText("");
      if (recognitionRef.current === recognition && !hadFatalError) {
        if (!manual) setListening(false);
        restartTimeoutId = setTimeout(() => {
          if (recognitionRef.current === recognition) {
            try {
              recognition.start();
            } catch {
              // ignore restart races
            }
          }
        }, manual ? 0 : RESTART_DELAY_MS);
      }
    };

    finalizeNowRef.current = () => {
      const text = latestInterim.trim();
      if (!text || manualStop) return;
      manualStop = true;
      pendingManualFinal = text;
      // stop() (unlike abort()) asks Chrome to return a final result for the
      // audio captured so far, which then arrives through onresult.
      recognition.stop();
    };

    recognitionRef.current = recognition;
    setError(null);
    try {
      recognition.start();
    } catch (err) {
      setError(err instanceof Error ? err.message : "음성 인식을 시작할 수 없습니다.");
    }

    return () => {
      if (restartTimeoutId) clearTimeout(restartTimeoutId);
      finalizeNowRef.current = null;
      recognition.onend = null;
      recognition.stop();
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
      }
      setInterimText("");
      setError(null);
      setListening(false);
    };
  }, [active, lang]);

  const finalizeNow = useCallback(() => finalizeNowRef.current?.(), []);

  return { interimText, supported, error, listening, finalizeNow };
}
