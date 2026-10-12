"use client";

import { useLayoutEffect, useRef } from "react";
import { syncScrollFades } from "@/lib/scroll-fades";
import type { TranscriptLine } from "@/lib/session-storage";
import { VoiceOrb, VoiceOrbTranslateButton } from "../VoiceOrb";
import styles from "./VoiceOverlay.module.css";

interface VoiceOverlayProps {
  /** False while no language is picked — shows the muted orb only. */
  speakerSelected: boolean;
  connecting: boolean;
  /** The active speaker's not-yet-final text ("" when nothing is being recognized). */
  interimText: string;
  /** The just-finished line still shown big before it drops into the feed. */
  heldLine: TranscriptLine | undefined;
  captionShrinking: boolean;
  onTranslate: () => void;
}

/**
 * The center-screen orb plus the big live caption under it: the sentence
 * being recognized, then that same line held with its translation.
 */
export function VoiceOverlay({
  speakerSelected,
  connecting,
  interimText,
  heldLine,
  captionShrinking,
  onTranslate,
}: VoiceOverlayProps) {
  const captionRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    // The big caption's box is capped (see .liveCaptionGroup) and can't be
    // scrolled by hand. While someone is speaking, follow the newest words;
    // once the line is held with its translation, show it from the start.
    const el = captionRef.current;
    if (!el) return;
    el.scrollTop = interimText ? el.scrollHeight : 0;
    syncScrollFades(el);
  }, [interimText, heldLine, connecting]);

  if (!speakerSelected) {
    // No speaker picked yet — show the orb in a muted/neutral color so
    // it's clearly "not active" rather than absent.
    return (
      <div className={styles.voiceOverlay}>
        <VoiceOrb idle />
      </div>
    );
  }

  // A fresh utterance starting takes priority over the previous one's
  // hold-then-shrink display.
  const captionText = interimText || heldLine?.original || null;
  const showingHeld = !interimText && Boolean(heldLine);
  const isShrinkingHeldCaption = captionShrinking && !interimText;

  return (
    <div className={styles.voiceOverlay}>
      {!connecting ? (
        <>
          <VoiceOrbTranslateButton onTranslate={onTranslate} disabled={!interimText} />
          {captionText && (
            <div
              ref={captionRef}
              className={
                isShrinkingHeldCaption
                  ? `${styles.liveCaptionGroup} ${styles.liveCaptionShrink}`
                  : styles.liveCaptionGroup
              }
              data-held={showingHeld || undefined}
            >
              <p className={styles.liveCaption}>{captionText}</p>
              {showingHeld && heldLine && (
                <p className={styles.liveCaptionTranslated}>
                  {heldLine.translating ? "번역 중..." : heldLine.translated}
                </p>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <div className={styles.loadingSlot} aria-hidden="true">
            <div className={styles.loadingSpinner} />
          </div>
          <p className={styles.loadingLabel}>마이크 연결 중...</p>
        </>
      )}
    </div>
  );
}
