"use client";

import { useCallback, useEffect, useState } from "react";
import type { CaptionLang } from "@/hooks/useSpeechCaption";
import type { TranscriptLine } from "@/lib/session-storage";
import type { Speaker } from "@/lib/speaker";

// How long to keep showing a just-finished utterance at full size in the
// big caption after its translation completes, and how long the shrink
// transition itself takes (must match the CSS transition duration).
const CAPTION_HOLD_MS = 3000;
const CAPTION_SHRINK_MS = 500;

interface CaptionHold {
  /** The line currently held in the big caption, or null. */
  displayLineId: number | null;
  captionShrinking: boolean;
  holdLine: (id: number) => void;
  releaseLine: () => void;
}

/**
 * Which finalized line is shown big in the center caption: held for a beat
 * once its translation is ready, then shrunk away into the feed.
 */
export function useCaptionHold(transcript: TranscriptLine[], speaker: Speaker): CaptionHold {
  const [displayLineId, setDisplayLineId] = useState<number | null>(null);
  const [captionShrinking, setCaptionShrinking] = useState(false);

  useEffect(() => {
    // Once a finalized utterance's translation finishes, hold it in the big
    // caption for a beat before shrinking it away into the feed — reruns
    // (and clears its own timers) whenever transcript/displayLineId/speaker
    // change, so a new utterance starting mid-hold, or the user switching
    // to the other language, cleanly cancels/redirects the old timers
    // instead of racing them.
    if (displayLineId === null) return;
    const line = transcript.find((l) => l.id === displayLineId);
    if (!line || line.translating) return;

    const startShrink = (delayMs: number) => {
      let shrinkTimer: ReturnType<typeof setTimeout> | undefined;
      const holdTimer = setTimeout(() => {
        setCaptionShrinking(true);
        shrinkTimer = setTimeout(() => {
          setDisplayLineId(null);
          setCaptionShrinking(false);
        }, CAPTION_SHRINK_MS);
      }, delayMs);
      return () => {
        clearTimeout(holdTimer);
        clearTimeout(shrinkTimer);
      };
    };

    // Switching to the *other* language while a line is held skips the
    // remaining wait — it shrinks away (and joins the feed) right away.
    const heldLang: CaptionLang = line.speaker === "나" ? "ko-KR" : "zh-CN";
    const activeLang: CaptionLang | null =
      speaker === "ko" ? "ko-KR" : speaker === "zh" ? "zh-CN" : null;
    const switchedToOtherLanguage = activeLang !== null && activeLang !== heldLang;

    return startShrink(switchedToOtherLanguage ? 0 : CAPTION_HOLD_MS);
  }, [transcript, displayLineId, speaker]);

  const holdLine = useCallback((id: number) => {
    setDisplayLineId(id);
    setCaptionShrinking(false);
  }, []);

  const releaseLine = useCallback(() => {
    setDisplayLineId(null);
    setCaptionShrinking(false);
  }, []);

  return { displayLineId, captionShrinking, holdLine, releaseLine };
}
