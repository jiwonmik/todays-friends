"use client";

import { useCallback, useState } from "react";
import type { CaptionLang } from "@/hooks/useSpeechCaption";
import type { TranscriptLine } from "@/lib/session-storage";
import { createTraceId } from "@/lib/trace";

let lineIdCounter = 0;

interface Transcript {
  transcript: TranscriptLine[];
  /** Appends a just-recognized utterance and sends it off for translation. */
  addLine: (speaker: TranscriptLine["speaker"], text: string, sourceLang: CaptionLang) => number;
  deleteLine: (id: number) => void;
  /** Replaces the log with a saved one, re-sending translations that never finished. */
  restoreLines: (lines: TranscriptLine[]) => void;
  clearLines: () => void;
}

/** The conversation log and the per-line translation requests that fill it in. */
export function useTranscript(onError: (message: string) => void): Transcript {
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);

  const translateLine = useCallback(
    async (id: number, text: string, sourceLang: CaptionLang) => {
      const traceId = createTraceId();
      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-trace-id": traceId },
          body: JSON.stringify({ text, sourceLang }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? `번역 요청이 실패했습니다 (${res.status})`);
        }
        setTranscript((prev) =>
          prev.map((line) =>
            line.id === id ? { ...line, translated: data.translated, translating: false } : line
          )
        );
      } catch (err) {
        console.error(`[translate][${traceId}] failed:`, err);
        const message = err instanceof Error ? err.message : "번역 요청이 실패했습니다.";
        onError(`${message} (trace: ${traceId})`);
        setTranscript((prev) =>
          prev.map((line) =>
            line.id === id ? { ...line, translated: "(번역 실패)", translating: false } : line
          )
        );
      }
    },
    [onError]
  );

  const addLine = useCallback(
    (speaker: TranscriptLine["speaker"], text: string, sourceLang: CaptionLang) => {
      const id = ++lineIdCounter;
      setTranscript((prev) => [
        ...prev,
        { id, speaker, original: text, translated: "", translating: true },
      ]);
      translateLine(id, text, sourceLang);
      return id;
    },
    [translateLine]
  );

  const deleteLine = useCallback((id: number) => {
    setTranscript((prev) => prev.filter((line) => line.id !== id));
  }, []);

  const restoreLines = useCallback(
    (lines: TranscriptLine[]) => {
      lineIdCounter = Math.max(...lines.map((l) => l.id));
      setTranscript(lines);
      // Translations cut off mid-request by the refresh never finished —
      // send them again.
      for (const line of lines) {
        if (line.translating) {
          translateLine(line.id, line.original, line.speaker === "나" ? "ko-KR" : "zh-CN");
        }
      }
    },
    [translateLine]
  );

  const clearLines = useCallback(() => {
    lineIdCounter = 0;
    setTranscript([]);
  }, []);

  return { transcript, addLine, deleteLine, restoreLines, clearLines };
}
