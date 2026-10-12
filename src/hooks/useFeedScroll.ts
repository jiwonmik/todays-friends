"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { syncScrollFades } from "@/lib/scroll-fades";
import type { TranscriptLine } from "@/lib/session-storage";

// Duration of the feed sliding into its new spot when ending/resuming.
const FEED_MOVE_MS = 450;

interface UseFeedScrollOptions {
  transcript: TranscriptLine[];
  displayLineId: number | null;
  showFeed: boolean;
  sessionActive: boolean;
}

interface FeedScroll {
  feedRef: RefObject<HTMLDivElement | null>;
  /** Call right before a change that moves the feed (ending/resuming), so
   *  it glides to its new spot instead of jumping. */
  rememberFeedPosition: () => void;
}

/** Keeps the conversation feed scrolled to the newest line and its edge fades in sync. */
export function useFeedScroll({
  transcript,
  displayLineId,
  showFeed,
  sessionActive,
}: UseFeedScrollOptions): FeedScroll {
  const feedRef = useRef<HTMLDivElement | null>(null);
  // The feed's on-screen top, recorded right before a layout change that
  // moves it (see the FLIP effect below); null when nothing is pending.
  const feedTopBeforeRef = useRef<number | null>(null);

  useEffect(() => {
    // Keep the most recent line in view. Depends on displayLineId too: a
    // line held in the big caption is filtered out of the feed until its
    // hold-then-shrink cycle finishes, so the feed's height (and thus what
    // "scrolled to bottom" means) also changes at that moment, not just
    // when `transcript` itself changes.
    const el = feedRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    // Smooth scrolling fires scroll events (and re-syncs) on the way down;
    // this covers content changes that don't scroll at all.
    syncScrollFades(el);
  }, [transcript, displayLineId]);

  useEffect(() => {
    // The feed's height follows the viewport, so a resize can hide or
    // reveal messages without any scrolling.
    const el = feedRef.current;
    if (!showFeed || !el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => syncScrollFades(el));
    observer.observe(el);
    return () => observer.disconnect();
  }, [showFeed]);

  useLayoutEffect(() => {
    // FLIP: the DOM already has the feed at its new position, but nothing
    // is painted yet — shift it back to where it was, then animate it to
    // its real spot. Runs before paint, so the jump is never visible.
    const before = feedTopBeforeRef.current;
    feedTopBeforeRef.current = null;
    const el = feedRef.current;
    if (before === null || !el || typeof el.animate !== "function") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const delta = before - el.getBoundingClientRect().top;
    if (Math.abs(delta) < 1) return;
    el.animate([{ transform: `translateY(${delta}px)` }, { transform: "translateY(0)" }], {
      duration: FEED_MOVE_MS,
      easing: "cubic-bezier(0.22, 0.61, 0.36, 1)",
    });
  }, [sessionActive]);

  const rememberFeedPosition = useCallback(() => {
    feedTopBeforeRef.current = feedRef.current?.getBoundingClientRect().top ?? null;
  }, []);

  return { feedRef, rememberFeedPosition };
}
