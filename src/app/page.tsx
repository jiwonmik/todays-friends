"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { ActivityReportForm } from "@/components/ActivityReportForm";
import { EndedActions } from "@/components/EndedActions";
import { EndSessionButton } from "@/components/EndSessionButton";
import { MeshBackdrop } from "@/components/MeshBackdrop";
import { PageTitle } from "@/components/PageTitle";
import { SpeakerToggle } from "@/components/SpeakerToggle";
import { StartButton } from "@/components/StartButton";
import { TranscriptFeed } from "@/components/TranscriptFeed";
import { VoiceOverlay } from "@/components/VoiceOverlay";
import { useCaptionHold } from "@/hooks/useCaptionHold";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import { useFadePresence } from "@/hooks/useFadePresence";
import { useFeedScroll } from "@/hooks/useFeedScroll";
import { useMeshTheme } from "@/hooks/useMeshTheme";
import { useReportDraft } from "@/hooks/useReportDraft";
import { useSpeechCaption, type CaptionLang } from "@/hooks/useSpeechCaption";
import { useTranscript } from "@/hooks/useTranscript";
import {
  clearSession,
  loadSession,
  loadStudentName,
  saveSession,
  saveStudentName,
  type TranscriptLine,
} from "@/lib/session-storage";
import type { Speaker } from "@/lib/speaker";
import styles from "./page.module.css";

// Chrome takes a moment to actually start listening after every language
// pick (opening the mic, connecting to the recognition service) even when
// permission was granted long ago. Only show "마이크 연결 중" if that wait
// lasts longer than this, so the normal startup gap doesn't flash it —
// it's really for a pending permission prompt or a slow connection.
const CONNECTING_INDICATOR_DELAY_MS = 400;

export default function Home() {
  const [sessionActive, setSessionActive] = useState(false);
  const [speaker, setSpeaker] = useState<Speaker>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [sessionStartAt, setSessionStartAt] = useState<Date | null>(null);
  const [sessionEndAt, setSessionEndAt] = useState<Date | null>(null);
  const [location, setLocation] = useState("");
  const [studentName, setStudentName] = useState("");
  // False until the localStorage snapshot (if any) has been read — the save
  // effect waits for it so the initial empty state never overwrites a
  // saved session before it's restored.
  const [restored, setRestored] = useState(false);

  const meshTheme = useMeshTheme();
  const { transcript, addLine, deleteLine, restoreLines, clearLines } = useTranscript(setApiError);
  const { report, summarizing, setReport, updateReportField, generateReport, cancelReportGeneration } =
    useReportDraft(transcript, setApiError);
  const { displayLineId, captionShrinking, holdLine, releaseLine } = useCaptionHold(transcript, speaker);

  const showFeed = sessionActive || transcript.length > 0;
  const { feedRef, rememberFeedPosition } = useFeedScroll({
    transcript,
    displayLineId,
    showFeed,
    sessionActive,
  });

  const handleFinalResult = useCallback(
    (speakerLabel: TranscriptLine["speaker"], sourceLang: CaptionLang) => (text: string) => {
      holdLine(addLine(speakerLabel, text, sourceLang));
    },
    [addLine, holdLine]
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
      restoreLines(saved.transcript);
      setReport(saved.report);
      setLocation(saved.location);
      setSessionStartAt(saved.sessionStartAt);
      setSessionEndAt(saved.sessionEndAt ?? saved.savedAt);
    }
    setRestored(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [restoreLines, setReport]);

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

  const activeCaption = speaker === "ko" ? koCaption : speaker === "zh" ? zhCaption : null;
  const connecting = useDelayedFlag(
    speaker !== null && !activeCaption?.listening,
    CONNECTING_INDICATOR_DELAY_MS
  );

  const startSession = () => {
    cancelReportGeneration();
    clearLines();
    setReport(null);
    setApiError(null);
    setLocation("");
    setSessionStartAt(new Date());
    setSessionEndAt(null);
    setSessionActive(true);
    setSpeaker(null);
    releaseLine();
  };

  // Continue the ended session instead of starting over: the transcript,
  // start time and line ids carry on. Any report draft is dropped, since it
  // no longer covers the whole conversation — it's regenerated after the
  // next end.
  const resumeSession = () => {
    // Resuming can change what sits above the feed (e.g. an error banner
    // clears), which would make it jump.
    rememberFeedPosition();
    cancelReportGeneration();
    setReport(null);
    setApiError(null);
    setSessionEndAt(null);
    setSessionActive(true);
    setSpeaker(null);
    // No speaker is picked on resume, so the center overlay shows no
    // caption — send any line still mid hold-then-shrink straight to the
    // feed instead of leaving it invisible until its timer runs out.
    releaseLine();
  };

  const endSession = () => {
    // Ending can change what sits above the feed, which would make it jump.
    rememberFeedPosition();
    setSessionActive(false);
    setSpeaker(null);
    setSessionEndAt(new Date());
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
  const endedActionsFade = useFadePresence(hasEndedSession);
  // Language can't be switched mid-utterance (speech currently being
  // recognized shows as interim text) or while any line is still being
  // translated — switching would cut off / mislabel what's in flight.
  const translating = transcript.some((line) => line.translating);
  const recognizing = Boolean(activeCaption?.interimText);
  const languageLocked = translating || recognizing;

  const themeVars = {
    "--accent": meshTheme.accent,
    "--accent-ko": meshTheme.accentKo,
    "--accent-zh": meshTheme.accentZh,
  } as CSSProperties;

  return (
    <div className={report ? `${styles.page} ${styles.pageWithReport}` : styles.page} style={themeVars}>
      <MeshBackdrop background={meshTheme.background} />
      <PageTitle position={isIdle ? "center" : "top"} />

      <header className={styles.header}>
        {heroStartFade.mounted && (
          <StartButton
            onStart={startSession}
            className={heroStartFade.className}
            {...heroStartFade.props}
          />
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

      {sessionActive && (
        <VoiceOverlay
          speakerSelected={speaker !== null}
          connecting={connecting}
          interimText={activeCaption?.interimText ?? ""}
          heldLine={
            displayLineId !== null ? transcript.find((l) => l.id === displayLineId) : undefined
          }
          captionShrinking={captionShrinking}
          onTranslate={() => activeCaption?.finalizeNow()}
        />
      )}

      {showFeed && (
        <TranscriptFeed
          // While a line is being held/shown big in the center overlay, it
          // hasn't "arrived" in the list yet — it only appears here once
          // its hold-then-shrink cycle finishes (displayLineId clears), at
          // which point it plays the feed's own entrance animation,
          // completing the "drops down into the list" effect.
          lines={transcript.filter((line) => line.id !== displayLineId)}
          review={Boolean(report) || summarizing}
          onDelete={deleteLine}
          feedRef={feedRef}
        />
      )}

      {speakerToggleFade.mounted && (
        <SpeakerToggle
          speaker={speaker}
          connecting={connecting}
          locked={languageLocked}
          onChange={setSpeaker}
          className={speakerToggleFade.className}
          {...speakerToggleFade.props}
        />
      )}

      {endedActionsFade.mounted && (
        <EndedActions
          reportTriggerHidden={Boolean(report) || summarizing}
          summarizing={summarizing}
          onGenerateReport={generateReport}
          onResume={resumeSession}
          onRestart={startSession}
          className={endedActionsFade.className}
          {...endedActionsFade.props}
        />
      )}

      {summarizing && <p>활동 일지 초안 생성 중...</p>}
      {report && (
        <ActivityReportForm
          report={report}
          sessionStartAt={sessionStartAt}
          sessionEndAt={sessionEndAt}
          studentName={studentName}
          location={location}
          onStudentNameChange={setStudentName}
          onLocationChange={setLocation}
          onFieldChange={updateReportField}
        />
      )}
    </div>
  );
}
