"use client";

import { useCallback, useRef, useState } from "react";
import type { ActivityReportDraft } from "@/lib/activity-report";
import type { TranscriptLine } from "@/lib/session-storage";
import { createTraceId } from "@/lib/trace";

interface ReportDraft {
  report: ActivityReportDraft | null;
  summarizing: boolean;
  setReport: (report: ActivityReportDraft | null) => void;
  updateReportField: (field: keyof ActivityReportDraft, value: string) => void;
  generateReport: () => Promise<void>;
  /** Drops any generation in progress: aborts the request (the server stops
   *  its API call too) and clears the loading state right away. */
  cancelReportGeneration: () => void;
}

/** The activity-log draft: generating it from the transcript and editing it. */
export function useReportDraft(
  transcript: TranscriptLine[],
  onError: (message: string) => void
): ReportDraft {
  const [report, setReport] = useState<ActivityReportDraft | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  // The in-flight /api/summarize request, so leaving the ended screen
  // (이어서 하기 / 새로 시작) can cancel it.
  const reportRequestRef = useRef<AbortController | null>(null);

  const updateReportField = useCallback((field: keyof ActivityReportDraft, value: string) => {
    setReport((prev) => (prev ? { ...prev, [field]: value } : prev));
  }, []);

  const cancelReportGeneration = useCallback(() => {
    reportRequestRef.current?.abort();
    reportRequestRef.current = null;
    setSummarizing(false);
  }, []);

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
      onError(`${message} (trace: ${traceId})`);
    } finally {
      // Only the latest request owns the loading state — a cancelled one
      // was already cleared by cancelReportGeneration.
      if (reportRequestRef.current === controller) {
        reportRequestRef.current = null;
        setSummarizing(false);
      }
    }
  };

  return { report, summarizing, setReport, updateReportField, generateReport, cancelReportGeneration };
}
