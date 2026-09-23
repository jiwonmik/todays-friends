"use client";

import { useEffect, useState } from "react";
import styles from "./useFadePresence.module.css";

export const FADE_PRESENCE_MS = 200;

/**
 * Mount/unmount with a fade: fades in when `show` turns true, and when it
 * turns false keeps the element rendered just long enough to fade out.
 *
 *   const fade = useFadePresence(show);
 *   {fade.mounted && <Thing className={fade.className} {...fade.props} />}
 *
 * While fading out the element is `inert` + `aria-hidden`, so it can't be
 * clicked, focused, or read out — it's already gone as far as anyone
 * interacting with the page is concerned.
 */
export function useFadePresence(show: boolean) {
  const [mounted, setMounted] = useState(show);

  // Adjusting state while rendering (not in an effect) so a newly shown
  // element appears in this same render instead of one render later.
  if (show && !mounted) setMounted(true);

  useEffect(() => {
    if (show || !mounted) return;
    const timeoutId = setTimeout(() => setMounted(false), FADE_PRESENCE_MS);
    return () => clearTimeout(timeoutId);
  }, [show, mounted]);

  const exiting = mounted && !show;
  return {
    mounted,
    className: exiting ? styles.fadeOut : styles.fadeIn,
    props: { inert: exiting, "aria-hidden": exiting || undefined },
  };
}
