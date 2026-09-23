import type { ActivityReportDraft } from "@/lib/activity-report";

export interface TranscriptLine {
  id: number;
  speaker: "나" | "학생";
  original: string;
  translated: string;
  translating: boolean;
}

/**
 * What survives a page refresh: the conversation and everything the
 * activity report is built from. Live/UI-only state (mic, current speaker,
 * caption animation) is deliberately left out — a refresh drops the mic
 * anyway, so a restored session always comes back as "ended".
 */
export interface StoredSession {
  transcript: TranscriptLine[];
  report: ActivityReportDraft | null;
  location: string;
  sessionStartAt: Date | null;
  sessionEndAt: Date | null;
  /** When this snapshot was written — stands in for the end time of a
   *  session that was still running when the page was refreshed. */
  savedAt: Date;
}

// Bump the version suffix if StoredSession's shape changes incompatibly, so
// an old snapshot is ignored instead of being misread.
const STORAGE_KEY = "friends-time:session:v1";

interface SerializedSession extends Omit<StoredSession, "sessionStartAt" | "sessionEndAt" | "savedAt"> {
  sessionStartAt: string | null;
  sessionEndAt: string | null;
  savedAt: string;
}

function toDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// localStorage can be missing (SSR), disabled, full, or blocked (private
// mode) — every access is best-effort and never breaks the page.

export function saveSession(session: Omit<StoredSession, "savedAt">): void {
  try {
    const serialized: SerializedSession = {
      ...session,
      sessionStartAt: session.sessionStartAt?.toISOString() ?? null,
      sessionEndAt: session.sessionEndAt?.toISOString() ?? null,
      savedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(serialized));
  } catch {
    // Best effort.
  }
}

export function loadSession(): StoredSession | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<SerializedSession>;
    if (!Array.isArray(data.transcript)) return null;
    return {
      transcript: data.transcript,
      report: data.report ?? null,
      location: typeof data.location === "string" ? data.location : "",
      sessionStartAt: toDate(data.sessionStartAt),
      sessionEndAt: toDate(data.sessionEndAt),
      savedAt: toDate(data.savedAt) ?? new Date(),
    };
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Best effort.
  }
}

// The student's name, typed in on the report (never hardcoded — it's personal
// data). Kept apart from the session snapshot so it survives 새로 시작: it's
// usually the same student every session.
const STUDENT_NAME_KEY = "friends-time:student-name";

export function loadStudentName(): string {
  try {
    return window.localStorage.getItem(STUDENT_NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveStudentName(name: string): void {
  try {
    if (name) window.localStorage.setItem(STUDENT_NAME_KEY, name);
    else window.localStorage.removeItem(STUDENT_NAME_KEY);
  } catch {
    // Best effort.
  }
}
