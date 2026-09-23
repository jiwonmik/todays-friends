import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSpeechCaption } from "./useSpeechCaption";

/** Minimal stand-in for Chrome's SpeechRecognition, driven by the test. */
class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = "";
  continuous = false;
  interimResults = false;
  onresult: ((event: unknown) => void) | null = null;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  start = vi.fn(() => this.onstart?.());
  stop = vi.fn();
  abort = vi.fn();

  constructor() {
    FakeRecognition.instances.push(this);
  }

  emit(text: string, isFinal: boolean) {
    const result = Object.assign([{ transcript: text }], { isFinal });
    this.onresult?.({ resultIndex: 0, results: [result] });
  }
}

describe("useSpeechCaption finalizeNow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeRecognition.instances = [];
    vi.stubGlobal("SpeechRecognition", FakeRecognition);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function setup() {
    const onFinalResult = vi.fn();
    const hook = renderHook(() => useSpeechCaption({ lang: "ko-KR", active: true, onFinalResult }));
    const recognition = FakeRecognition.instances[0];
    return { hook, recognition, onFinalResult };
  }

  it("stops recognition so Chrome finalizes now, then restarts immediately", () => {
    const { hook, recognition, onFinalResult } = setup();
    act(() => recognition.emit("안녕하", false));

    act(() => hook.result.current.finalizeNow());
    expect(recognition.stop).toHaveBeenCalledTimes(1);

    act(() => {
      recognition.emit("안녕하세요", true);
      recognition.onend?.();
    });
    expect(onFinalResult).toHaveBeenCalledTimes(1);
    expect(onFinalResult).toHaveBeenCalledWith("안녕하세요");
    // No "connecting" flash and no 3s silence-restart delay.
    expect(hook.result.current.listening).toBe(true);
    act(() => vi.advanceTimersByTime(0));
    expect(recognition.start).toHaveBeenCalledTimes(2);
  });

  it("falls back to the on-screen interim text if Chrome stops without a final result", () => {
    const { hook, recognition, onFinalResult } = setup();
    act(() => recognition.emit("안녕하", false));

    act(() => {
      hook.result.current.finalizeNow();
      recognition.onend?.();
    });

    expect(onFinalResult).toHaveBeenCalledWith("안녕하");
    expect(hook.result.current.interimText).toBe("");
  });

  it("does nothing when nothing is being recognized", () => {
    const { hook, recognition } = setup();
    act(() => hook.result.current.finalizeNow());
    expect(recognition.stop).not.toHaveBeenCalled();
  });

  it("still waits before restarting after an ordinary silence stop", () => {
    const { hook, recognition } = setup();
    act(() => recognition.onend?.());
    expect(hook.result.current.listening).toBe(false);
    act(() => vi.advanceTimersByTime(2999));
    expect(recognition.start).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(1));
    expect(recognition.start).toHaveBeenCalledTimes(2);
  });
});
