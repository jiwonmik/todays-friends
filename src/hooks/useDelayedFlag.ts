"use client";

import { useEffect, useState } from "react";

/**
 * `value`, but only once it has stayed true for `delayMs` — a short-lived
 * true never shows up at all, and false always passes through immediately.
 * The usual "delayed spinner" pattern: a loading state that resolves
 * quickly shouldn't flash on screen.
 */
export function useDelayedFlag(value: boolean, delayMs: number): boolean {
  const [elapsed, setElapsed] = useState(false);

  useEffect(() => {
    if (!value) return;
    const timeoutId = setTimeout(() => setElapsed(true), delayMs);
    return () => {
      clearTimeout(timeoutId);
      setElapsed(false);
    };
  }, [value, delayMs]);

  return value && elapsed;
}
