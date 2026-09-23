"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Button } from "@/components/Button";
import { EndSessionButton } from "@/components/EndSessionButton";
import { PageTitle } from "@/components/PageTitle";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import { useFadePresence } from "@/hooks/useFadePresence";
import { useSpeechCaption, type CaptionLang } from "@/hooks/useSpeechCaption";
import {
  ACTIVITY_FRIEND_NAME,
  ACTIVITY_SUBJECT_NAME,
  type ActivityReportDraft,
} from "@/lib/activity-report";
import { formatActivityDate, formatActivityTime } from "@/lib/datetime";
import { buildActivityFormPrefillUrl } from "@/lib/google-form";
import {
  generateDailyMeshTheme,
  generateRandomMeshTheme,
  INITIAL_MESH_THEME,
} from "@/lib/mesh-background";
import {
  clearSession,
  loadSession,
  loadStudentName,
  saveSession,
  saveStudentName,
  type TranscriptLine,
} from "@/lib/session-storage";
import { createTraceId } from "@/lib/trace";
import styles from "./page.module.css";

type Speaker = "ko" | "zh" | null;

let lineIdCounter = 0;

// How long to keep showing a just-finished utterance at full size in the
// big caption after its translation completes, and how long the shrink
// transition itself takes (must match the CSS transition duration).
const CAPTION_HOLD_MS = 3000;
const CAPTION_SHRINK_MS = 500;

// Chrome takes a moment to actually start listening after every language
// pick (opening the mic, connecting to the recognition service) even when
// permission was granted long ago. Only show "마이크 연결 중" if that wait
// lasts longer than this, so the normal startup gap doesn't flash it —
// it's really for a pending permission prompt or a slow connection.
const CONNECTING_INDICATOR_DELAY_MS = 400;

// Duration of the feed sliding into its new spot when ending/resuming.
const FEED_MOVE_MS = 450;

/**
 * Marks which edges of the scrollable feed have messages hidden past them
 * (`data-fade-top` / `data-fade-bottom`), which the CSS turns into a fade-out
 * at that edge as a "there's more" cue. Written straight to the DOM, not
 * state — it changes on every scroll frame and nothing else depends on it.
 */
function syncFeedFades(el: HTMLElement) {
  el.dataset.fadeTop = String(el.scrollTop > 1);
  el.dataset.fadeBottom = String(el.scrollHeight - el.clientHeight - el.scrollTop > 1);
}

function PersonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4.418 3.582-8 8-8s8 3.582 8 8v1H4z" />
    </svg>
  );
}

function PlayIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

// Play triangle with a bar in front of it — "pick up where you left off"
// rather than the plain play of a brand-new session.
function ResumeIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="5" y="5" width="3" height="14" rx="1" />
      <path d="M10 5v14l10-7z" />
    </svg>
  );
}

function DocumentIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h4" />
    </svg>
  );
}

// Circular arrow — wipe and start over.
function RestartIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </svg>
  );
}

function TranslateIcon({ size = 40 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m5 8 6 6" />
      <path d="m4 14 6-6 2-3" />
      <path d="M2 5h12" />
      <path d="M7 2h1" />
      <path d="m22 22-5-10-5 10" />
      <path d="M14 18h6" />
    </svg>
  );
}

/** The swirling "voice orb" itself — purely visual. */
function VoiceOrb({ idle }: { idle?: boolean }) {
  return (
    <span
      className={idle ? `${styles.voiceOrb} ${styles.voiceOrbIdle}` : styles.voiceOrb}
      aria-hidden="true"
    >
      <span className={styles.voiceOrbBlobA} />
      <span className={styles.voiceOrbBlobB} />
      <span className={styles.voiceOrbBlobC} />
      <span className={styles.voiceOrbTint} />
    </span>
  );
}

/**
 * The orb while a speaker is being listened to, doubling as the "translate
 * now" control: it looks the same as the plain orb, and on hover/focus a
 * translate icon fades in over an accent-tinted wash. Disabled while
 * nothing is being recognized.
 */
function VoiceOrbTranslateButton({ onTranslate, disabled }: { onTranslate: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      className={styles.voiceOrbButton}
      onClick={onTranslate}
      disabled={disabled}
      aria-label="지금 번역하기"
    >
      <VoiceOrb />
      <span className={styles.voiceOrbIcon}>
        <TranslateIcon />
      </span>
    </button>
  );
}

export default function Home() {
  const [sessionActive, setSessionActive] = useState(false);
  const [speaker, setSpeaker] = useState<Speaker>(null);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [report, setReport] = useState<ActivityReportDraft | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [sessionStartAt, setSessionStartAt] = useState<Date | null>(null);
  const [sessionEndAt, setSessionEndAt] = useState<Date | null>(null);
  const [location, setLocation] = useState("");
  const [studentName, setStudentName] = useState("");
  const [meshTheme, setMeshTheme] = useState(INITIAL_MESH_THEME);
  const [displayLineId, setDisplayLineId] = useState<number | null>(null);
  const [captionShrinking, setCaptionShrinking] = useState(false);
  // False until the localStorage snapshot (if any) has been read — the save
  // effect waits for it so the initial empty state never overwrites a
  // saved session before it's restored.
  const [restored, setRestored] = useState(false);
  const feedRef = useRef<HTMLDivElement | null>(null);
  // The feed's on-screen top, recorded right before a layout change that
  // moves it (see the FLIP effect below); null when nothing is pending.
  const feedTopBeforeRef = useRef<number | null>(null);
  // The in-flight /api/summarize request, so leaving the ended screen
  // (이어서 하기 / 새로 시작) can cancel it.
  const reportRequestRef = useRef<AbortController | null>(null);

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
    syncFeedFades(el);
  }, [transcript, displayLineId]);

  const showFeed = sessionActive || transcript.length > 0;
  useEffect(() => {
    // The feed's height follows the viewport, so a resize can hide or
    // reveal messages without any scrolling.
    const el = feedRef.current;
    if (!showFeed || !el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => syncFeedFades(el));
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

  useEffect(() => {
    // Deployed: one theme per day. Local dev (`next dev`): a fresh random
    // theme on every refresh, to preview the range of themes. Both are
    // moment-dependent, so they're computed here, client-only, never during
    // render (that would cause a hydration mismatch).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-only sync of a moment-dependent value, deliberately deferred out of render to avoid a hydration mismatch
    setMeshTheme(
      process.env.NODE_ENV === "development" ? generateRandomMeshTheme() : generateDailyMeshTheme()
    );
  }, []);

  const updateReportField = (field: keyof ActivityReportDraft, value: string) => {
    setReport((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const translateLine = useCallback(async (id: number, text: string, sourceLang: CaptionLang) => {
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
      setApiError(`${message} (trace: ${traceId})`);
      setTranscript((prev) =>
        prev.map((line) =>
          line.id === id ? { ...line, translated: "(번역 실패)", translating: false } : line
        )
      );
    }
  }, []);

  const handleFinalResult = useCallback(
    (speakerLabel: "나" | "학생", sourceLang: CaptionLang) => (text: string) => {
      const id = ++lineIdCounter;
      setTranscript((prev) => [
        ...prev,
        { id, speaker: speakerLabel, original: text, translated: "", translating: true },
      ]);
      setDisplayLineId(id);
      setCaptionShrinking(false);
      translateLine(id, text, sourceLang);
    },
    [translateLine]
  );

  useEffect(() => {
    // Restore the last conversation after a refresh. Client-only (in an
    // effect, not during render) since localStorage doesn't exist on the
    // server — reading it during render would cause a hydration mismatch.
    // A refresh drops the mic, so a session that was still running comes
    // back as ended (with 이어서 하기 available), its last save time
    // standing in for the end time.
    /* eslint-disable react-hooks/set-state-in-effect -- one-time client-only restore from localStorage, deliberately deferred out of render to avoid a hydration mismatch */
    setStudentName(loadStudentName());
    const saved = loadSession();
    if (saved && saved.transcript.length > 0) {
      lineIdCounter = Math.max(...saved.transcript.map((l) => l.id));
      setTranscript(saved.transcript);
      setReport(saved.report);
      setLocation(saved.location);
      setSessionStartAt(saved.sessionStartAt);
      setSessionEndAt(saved.sessionEndAt ?? saved.savedAt);
      /* eslint-enable react-hooks/set-state-in-effect */
      // Translations cut off mid-request by the refresh never finished —
      // send them again.
      for (const line of saved.transcript) {
        if (line.translating) {
          translateLine(line.id, line.original, line.speaker === "나" ? "ko-KR" : "zh-CN");
        }
      }
    }
    setRestored(true);
  }, [translateLine]);

  useEffect(() => {
    if (!restored) return;
    if (transcript.length === 0) {
      // Nothing said yet (or just wiped by 새로 시작) — nothing worth restoring.
      clearSession();
      return;
    }
    saveSession({ transcript, report, location, sessionStartAt, sessionEndAt });
  }, [restored, transcript, report, location, sessionStartAt, sessionEndAt]);

  useEffect(() => {
    if (restored) saveStudentName(studentName);
  }, [restored, studentName]);

  const koCaption = useSpeechCaption({
    lang: "ko-KR",
    active: sessionActive && speaker === "ko",
    onFinalResult: handleFinalResult("나", "ko-KR"),
  });

  const zhCaption = useSpeechCaption({
    lang: "zh-CN",
    active: sessionActive && speaker === "zh",
    onFinalResult: handleFinalResult("학생", "zh-CN"),
  });

  const activeListening =
    speaker === "ko" ? koCaption.listening : speaker === "zh" ? zhCaption.listening : false;
  const connecting = useDelayedFlag(speaker !== null && !activeListening, CONNECTING_INDICATOR_DELAY_MS);

  // Drop any report generation in progress: abort the request (the server
  // stops its API call too) and clear the loading state right away.
  const cancelReportGeneration = () => {
    reportRequestRef.current?.abort();
    reportRequestRef.current = null;
    setSummarizing(false);
  };

  const startSession = () => {
    cancelReportGeneration();
    lineIdCounter = 0;
    setTranscript([]);
    setReport(null);
    setApiError(null);
    setLocation("");
    setSessionStartAt(new Date());
    setSessionEndAt(null);
    setSessionActive(true);
    setSpeaker(null);
    setDisplayLineId(null);
    setCaptionShrinking(false);
  };

  // Continue the ended session instead of starting over: the transcript,
  // start time and line ids carry on. Any report draft is dropped, since it
  // no longer covers the whole conversation — it's regenerated after the
  // next end.
  const resumeSession = () => {
    // Resuming can change what sits above the feed (e.g. an error banner
    // clears), which would make it jump — note where it is now so it can
    // glide instead.
    feedTopBeforeRef.current = feedRef.current?.getBoundingClientRect().top ?? null;
    cancelReportGeneration();
    setReport(null);
    setApiError(null);
    setSessionEndAt(null);
    setSessionActive(true);
    setSpeaker(null);
    // No speaker is picked on resume, so the center overlay shows no
    // caption — send any line still mid hold-then-shrink straight to the
    // feed instead of leaving it invisible until its timer runs out.
    setDisplayLineId(null);
    setCaptionShrinking(false);
  };

  const endSession = () => {
    // Ending can change what sits above the feed, which would make it jump
    // — note where it is now so it can glide instead.
    feedTopBeforeRef.current = feedRef.current?.getBoundingClientRect().top ?? null;
    setSessionActive(false);
    setSpeaker(null);
    setSessionEndAt(new Date());
  };

  const generateReport = async () => {
    if (transcript.length === 0) return;
    reportRequestRef.current?.abort();
    const controller = new AbortController();
    reportRequestRef.current = controller;
    setSummarizing(true);
    const traceId = createTraceId();
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", "x-trace-id": traceId },
        body: JSON.stringify({
          transcript: transcript.map(({ speaker, original }) => ({
            speaker,
            text: original,
          })),
        }),
      });
      const data = await res.json();
      // Cancelled after the response already arrived — drop it.
      if (controller.signal.aborted) return;
      if (!res.ok) {
        throw new Error(data.error ?? `활동 일지 생성이 실패했습니다 (${res.status})`);
      }
      setReport(data.report);
    } catch (err) {
      // Cancelled on purpose (이어서 하기 / 새로 시작) — not an error.
      if (controller.signal.aborted) return;
      console.error(`[summarize][${traceId}] failed:`, err);
      const message = err instanceof Error ? err.message : "활동 일지 생성이 실패했습니다.";
      setApiError(`${message} (trace: ${traceId})`);
    } finally {
      // Only the latest request owns the loading state — a cancelled one
      // was already cleared by cancelReportGeneration.
      if (reportRequestRef.current === controller) {
        reportRequestRef.current = null;
        setSummarizing(false);
      }
    }
  };

  const supported = koCaption.supported && zhCaption.supported;
  // Three distinct screens share this one component: the true idle/first
  // screen (nothing said yet), an active session, and a session that just
  // ended (transcript to review) — kept visually separate so "ended" never
  // looks like "not started yet" again.
  const isIdle = !sessionActive && transcript.length === 0;
  const hasEndedSession = !sessionActive && transcript.length > 0;

  // Every control that comes and goes fades in/out instead of popping.
  const heroStartFade = useFadePresence(isIdle);
  const endButtonFade = useFadePresence(sessionActive);
  const speakerToggleFade = useFadePresence(sessionActive);
  // Language can't be switched mid-utterance (speech currently being
  // recognized shows as interim text) or while any line is still being
  // translated — switching would cut off / mislabel what's in flight.
  const translating = transcript.some((line) => line.translating);
  const recognizing =
    (speaker === "ko" && koCaption.interimText !== "") ||
    (speaker === "zh" && zhCaption.interimText !== "");
  const languageLocked = translating || recognizing;

  // Pre-filled link to the activity-log Google Form, or null when no form ID
  // is configured (see getActivityFormId).
  const activityFormUrl = report
    ? buildActivityFormPrefillUrl({
        activityDate: sessionStartAt ? formatActivityDate(sessionStartAt) : "",
        friendName: ACTIVITY_FRIEND_NAME,
        studentName,
        subject: ACTIVITY_SUBJECT_NAME,
        startTime: sessionStartAt ? formatActivityTime(sessionStartAt) : "",
        endTime: sessionEndAt ? formatActivityTime(sessionEndAt) : "",
        location,
        mainContent: report.mainContent,
        evaluation: report.evaluation,
        highlight: report.highlight,
        gratitude: report.gratitude,
      })
    : null;

  const endedActionsFade = useFadePresence(hasEndedSession);
  // 활동 일지 생성하기 is hidden (not removed) once a draft is generating or
  // done — it keeps its slot so the row under it never shifts.
  const reportTriggerHidden = Boolean(report) || summarizing;

  const themeVars = {
    "--accent": meshTheme.accent,
    "--accent-ko": meshTheme.accentKo,
    "--accent-zh": meshTheme.accentZh,
  } as CSSProperties;

  return (
    <div className={report ? `${styles.page} ${styles.pageWithReport}` : styles.page} style={themeVars}>
      <div className={styles.backdrop} aria-hidden="true">
        <div
          className={styles.backdropGradient}
          style={{ backgroundImage: meshTheme.background }}
        />
        <div className={styles.backdropGrain} />
      </div>
      <PageTitle position={isIdle ? "center" : "top"} />

      <header className={styles.header}>
        {heroStartFade.mounted && (
          <div
            className={`${styles.heroStartButtonFixed} ${heroStartFade.className}`}
            {...heroStartFade.props}
          >
            <span className={styles.ripple} aria-hidden="true" />
            <span className={styles.ripple} aria-hidden="true" />
            <span className={styles.ripple} aria-hidden="true" />
            <Button
              size="iconLg"
              className={styles.heroStartButton}
              onClick={startSession}
              aria-label="시작하기"
            >
              <PlayIcon size={34} />
            </Button>
          </div>
        )}
      </header>

      {endButtonFade.mounted && (
        <EndSessionButton onEnd={endSession} className={endButtonFade.className} {...endButtonFade.props} />
      )}

      {!supported && (
        <p className={styles.warning}>
          이 브라우저는 음성 인식을 지원하지 않습니다. Chrome에서 열어주세요.
        </p>
      )}
      {(koCaption.error || zhCaption.error) && (
        <p className={styles.warning}>{koCaption.error ?? zhCaption.error}</p>
      )}
      {apiError && (
        <p className={styles.warning}>
          {apiError}
          <br />
          서버 터미널 로그에서 같은 trace id로 검색하면 원인을 자세히 볼 수 있어요.
        </p>
      )}

      {sessionActive &&
        (() => {
          if (!speaker) {
            // No speaker picked yet — show the orb in a muted/neutral
            // color so it's clearly "not active" rather than absent.
            return (
              <div className={styles.voiceOverlay}>
                <VoiceOrb idle />
              </div>
            );
          }

          const interimText = speaker === "ko" ? koCaption.interimText : zhCaption.interimText;
          const finalizeNow = speaker === "ko" ? koCaption.finalizeNow : zhCaption.finalizeNow;
          const heldLine =
            displayLineId !== null ? transcript.find((l) => l.id === displayLineId) : undefined;
          // A fresh utterance starting takes priority over the previous
          // one's hold-then-shrink display.
          const captionText = interimText || heldLine?.original || null;
          const showingHeld = !interimText && Boolean(heldLine);
          const isShrinkingHeldCaption = captionShrinking && !interimText;
          return (
            <div className={styles.voiceOverlay}>
              {!connecting ? (
                <>
                  <VoiceOrbTranslateButton onTranslate={finalizeNow} disabled={!interimText} />
                  {captionText && (
                    <div
                      className={
                        isShrinkingHeldCaption
                          ? `${styles.liveCaptionGroup} ${styles.liveCaptionShrink}`
                          : styles.liveCaptionGroup
                      }
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
        })()}

      {showFeed && (
        <div
          // Once a report is requested the whole log is being reviewed, not
          // followed live — every line gets the same full-ink treatment.
          className={report || summarizing ? `${styles.feed} ${styles.feedReview}` : styles.feed}
          ref={feedRef}
          onScroll={(e) => syncFeedFades(e.currentTarget)}
        >
          {transcript
            // While a line is being held/shown big in the center overlay,
            // it hasn't "arrived" in the list yet — it only appears here
            // once its hold-then-shrink cycle finishes (displayLineId
            // clears), at which point it plays the feed's own entrance
            // animation, completing the "drops down into the list" effect.
            .filter((line) => line.id !== displayLineId)
            .map((line, index, visible) => {
              const isKo = line.speaker === "나";
              return (
                <div
                  key={line.id}
                  className={`${styles.messageRow} ${isKo ? styles.messageRowKo : styles.messageRowZh}`}
                >
                  <div className={isKo ? styles.avatarKo : styles.avatarZh} aria-hidden="true">
                    <PersonIcon />
                  </div>
                  <div
                    className={index === visible.length - 1 ? styles.messageLatest : styles.messageOlder}
                  >
                    <div className={styles.messageOriginal}>{line.original}</div>
                    <div className={styles.messageTranslated}>
                      {line.translating ? "번역 중..." : line.translated}
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {speakerToggleFade.mounted && (
        <div
          className={`${styles.speakerToggle} ${speakerToggleFade.className}`}
          {...speakerToggleFade.props}
        >
          <Button
            variant={speaker !== "ko" ? "toggle" : connecting ? "pending" : "toggleKo"}
            onClick={() => setSpeaker(speaker === "ko" ? null : "ko")}
            disabled={languageLocked}
          >
            한국어
            {speaker === "ko" && connecting && (
              <span className={styles.pendingHint}> · 마이크 연결 중...</span>
            )}
          </Button>
          <Button
            variant={speaker !== "zh" ? "toggle" : connecting ? "pending" : "toggleZh"}
            onClick={() => setSpeaker(speaker === "zh" ? null : "zh")}
            disabled={languageLocked}
          >
            中文
            {speaker === "zh" && connecting && (
              <span className={styles.pendingHint}> · 마이크 연결 중...</span>
            )}
          </Button>
        </div>
      )}

      {endedActionsFade.mounted && (
        <div
          className={`${styles.endedActions} ${endedActionsFade.className}`}
          {...endedActionsFade.props}
        >
          <Button
            className={
              reportTriggerHidden
                ? `${styles.iconLabelButton} ${styles.reportTrigger} ${styles.reportTriggerHidden}`
                : `${styles.iconLabelButton} ${styles.reportTrigger}`
            }
            onClick={generateReport}
            inert={reportTriggerHidden}
            aria-hidden={reportTriggerHidden || undefined}
          >
            <DocumentIcon />
            활동 일지 생성하기
          </Button>
          <div className={styles.endedActionsRow}>
            <Button className={styles.iconLabelButton} onClick={resumeSession}>
              <ResumeIcon size={18} />
              이어서 하기
            </Button>
            <Button
              className={styles.iconLabelButton}
              onClick={startSession}
              // Disabled (not hidden) while a report is generating, so
              // starting over can't wipe the session out from under the
              // in-flight request — 이어서 하기 stays available and cancels it.
              disabled={summarizing}
            >
              <RestartIcon />
              새로 시작
            </Button>
          </div>
        </div>
      )}

      {summarizing && <p>활동 일지 초안 생성 중...</p>}
      {report && (
        <div className={styles.summaryBox}>
          <h2>활동 일지 초안</h2>
          <p className={styles.reportHint}>
            아래는 AI가 대화 내용을 바탕으로 작성한 초안이에요. 제출 전에 확인하고 자유롭게 수정해주세요.
          </p>

          <div className={styles.reportMeta}>
            <div>
              <span className={styles.reportMetaLabel}>활동일자</span>
              {sessionStartAt ? formatActivityDate(sessionStartAt) : "-"}
            </div>
            <div>
              <span className={styles.reportMetaLabel}>시작 · 종료 시간</span>
              {sessionStartAt ? formatActivityTime(sessionStartAt) : "-"} ~{" "}
              {sessionEndAt ? formatActivityTime(sessionEndAt) : "-"}
            </div>
            <div>
              <span className={styles.reportMetaLabel}>프렌즈명</span>
              {ACTIVITY_FRIEND_NAME}
            </div>
            <div>
              <span className={styles.reportMetaLabel}>과목명</span>
              {ACTIVITY_SUBJECT_NAME}
            </div>
          </div>

          <div className={styles.reportField}>
            <label htmlFor="studentName">3. 학생명</label>
            <input
              id="studentName"
              type="text"
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              placeholder="학생 이름"
            />
          </div>

          <div className={styles.reportField}>
            <label htmlFor="location">6. 활동 장소</label>
            <input
              id="location"
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="예: 학교 도서관"
            />
          </div>

          <div className={styles.reportField}>
            <label htmlFor="mainContent">8-1. 이번 주 활동한 주요 교육 내용</label>
            <textarea
              id="mainContent"
              value={report.mainContent}
              onChange={(e) => updateReportField("mainContent", e.target.value)}
            />
          </div>

          <div className={styles.reportField}>
            <label htmlFor="evaluation">8-2. 이번 주 활동에 대한 전반적 평가</label>
            <textarea
              id="evaluation"
              value={report.evaluation}
              onChange={(e) => updateReportField("evaluation", e.target.value)}
            />
          </div>

          <div className={styles.reportField}>
            <label htmlFor="highlight">9. 가장 인상 깊었던 대화 혹은 활동</label>
            <textarea
              id="highlight"
              value={report.highlight}
              onChange={(e) => updateReportField("highlight", e.target.value)}
            />
          </div>

          <div className={styles.reportField}>
            <label htmlFor="gratitude">10. 활동 중 느낀 감사 혹은 기도 제목</label>
            <textarea
              id="gratitude"
              value={report.gratitude}
              onChange={(e) => updateReportField("gratitude", e.target.value)}
              placeholder="대화에서 특별히 드러나지 않아 비워뒀어요. 직접 작성해주세요."
            />
          </div>

          {activityFormUrl ? (
            <>
              <Button
                href={activityFormUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.formLinkButton}
              >
                구글폼 열기
              </Button>
              <p className={styles.reportHint}>
                새 탭에서 폼이 열리고 위 내용이 채워져 있을 거예요. 자기평가 항목(7번)은 직접 선택하고, 확인 후 제출 버튼을 눌러주세요.
              </p>
            </>
          ) : (
            <p className={styles.reportHint}>
              구글폼 주소가 설정되지 않았어요. 환경변수 NEXT_PUBLIC_ACTIVITY_FORM_ID를 확인해주세요.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
