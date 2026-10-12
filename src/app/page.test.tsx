import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSpeechCaption, type CaptionLang } from "@/hooks/useSpeechCaption";
import Home from "./page";

vi.mock("@/hooks/useSpeechCaption", () => ({
  useSpeechCaption: vi.fn(),
}));

const mockedUseSpeechCaption = vi.mocked(useSpeechCaption);

/**
 * The real hook talks to the browser's SpeechRecognition API, which jsdom
 * doesn't implement. We replace it with a stub that just records the
 * `onFinalResult` callback for each language so tests can trigger a "final"
 * speech result manually, the same way the real hook would after Chrome
 * finishes recognizing an utterance.
 */
function mockSpeechRecognition() {
  const finalResultCallbacks: Partial<Record<CaptionLang, (text: string) => void>> = {};
  mockedUseSpeechCaption.mockImplementation(({ lang, onFinalResult }) => {
    finalResultCallbacks[lang] = onFinalResult;
    return { interimText: "", supported: true, error: null, listening: true, finalizeNow: vi.fn() };
  });
  return finalResultCallbacks;
}

const SAMPLE_REPORT = {
  mainContent: "오늘은 인사말과 자기소개 표현을 연습했습니다.",
  evaluation: "적극적으로 참여했습니다.",
  highlight: "학생이 스스로 문장을 만들어 말한 순간이 인상 깊었습니다.",
  gratitude: "",
};

function mockFetchResponses() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/translate") {
        const body = JSON.parse(init!.body as string) as { sourceLang: CaptionLang };
        const translated = body.sourceLang === "ko-KR" ? "你好" : "안녕하세요";
        return new Response(JSON.stringify({ translated }), { status: 200 });
      }
      if (url === "/api/summarize") {
        return new Response(JSON.stringify({ report: SAMPLE_REPORT }), { status: 200 });
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    })
  );
}

describe("Home", () => {
  let finalResultCallbacks: ReturnType<typeof mockSpeechRecognition>;

  beforeEach(() => {
    // The page persists the session to localStorage — start every test clean.
    localStorage.clear();
    finalResultCallbacks = mockSpeechRecognition();
    mockFetchResponses();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("hides the speaker toggle until a session is started", () => {
    render(<Home />);

    expect(screen.queryByText("한국어")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "시작하기" }));

    expect(screen.getByText("한국어")).toBeInTheDocument();
    expect(screen.getByText("中文")).toBeInTheDocument();
  });

  it("logs a Korean utterance and shows its Chinese translation", async () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "시작하기" }));
    fireEvent.click(screen.getByText("한국어"));

    act(() => {
      finalResultCallbacks["ko-KR"]?.("안녕하세요");
    });

    // Appears twice: the big "currently speaking" caption and the feed item.
    expect(screen.getAllByText("안녕하세요").length).toBeGreaterThan(0);
    expect(await screen.findByText("你好")).toBeInTheDocument();
  });

  it("logs a Chinese utterance and shows its Korean translation", async () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "시작하기" }));
    fireEvent.click(screen.getByText("中文"));

    act(() => {
      finalResultCallbacks["zh-CN"]?.("你好，老师");
    });

    // Appears twice: the big "currently speaking" caption and the feed item.
    expect(screen.getAllByText("你好，老师").length).toBeGreaterThan(0);
    expect(await screen.findByText("안녕하세요")).toBeInTheDocument();
  });

  it("only recognizes the active speaker's language at a time", () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "시작하기" }));
    fireEvent.click(screen.getByText("한국어"));

    expect(mockedUseSpeechCaption).toHaveBeenCalledWith(
      expect.objectContaining({ lang: "ko-KR", active: true })
    );
    expect(mockedUseSpeechCaption).toHaveBeenCalledWith(
      expect.objectContaining({ lang: "zh-CN", active: false })
    );
  });

  it("shows a pending state only if recognition is slow to start listening (e.g. while a mic permission prompt is pending)", () => {
    vi.useFakeTimers();
    const listeningByLang: Partial<Record<CaptionLang, boolean>> = {};
    mockedUseSpeechCaption.mockImplementation(({ lang }) => ({
      interimText: "",
      supported: true,
      error: null,
      listening: listeningByLang[lang] ?? false,
      finalizeNow: vi.fn(),
    }));

    const { rerender } = render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "시작하기" }));
    fireEvent.click(screen.getByText("한국어"));

    // Chrome's normal startup gap: not listening yet, but too soon to call
    // it "connecting" — nothing flashes.
    expect(screen.queryByText(/마이크 연결 중/)).not.toBeInTheDocument();

    // Still not listening after the grace period: shows the pending hint
    // (on the button and as the center-screen loading indicator), not the
    // fully-active style, so it's never confused with "already listening".
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getAllByText(/마이크 연결 중/).length).toBeGreaterThan(0);

    listeningByLang["ko-KR"] = true;
    rerender(<Home />);

    expect(screen.queryByText(/마이크 연결 중/)).not.toBeInTheDocument();
  });

  it("never shows the pending state when recognition starts listening quickly", () => {
    vi.useFakeTimers();
    let koListening = false;
    mockedUseSpeechCaption.mockImplementation(({ lang }) => ({
      interimText: "",
      supported: true,
      error: null,
      listening: lang === "ko-KR" && koListening,
      finalizeNow: vi.fn(),
    }));

    const { rerender } = render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "시작하기" }));
    fireEvent.click(screen.getByText("한국어"));
    act(() => {
      vi.advanceTimersByTime(200);
    });
    koListening = true;
    rerender(<Home />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.queryByText(/마이크 연결 중/)).not.toBeInTheDocument();
  });

  it("does not generate a report just from ending the session", async () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "시작하기" }));
    fireEvent.click(screen.getByText("한국어"));
    act(() => {
      finalResultCallbacks["ko-KR"]?.("안녕하세요");
    });
    await screen.findByText("你好");

    fireEvent.click(screen.getByRole("button", { name: "종료하기" }));

    expect(fetch).not.toHaveBeenCalledWith(
      "/api/summarize",
      expect.anything()
    );
    expect(screen.getByText("활동 일지 생성하기")).toBeInTheDocument();
  });

  it("generates an editable activity report draft when the report button is clicked", async () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "시작하기" }));
    fireEvent.click(screen.getByText("한국어"));
    act(() => {
      finalResultCallbacks["ko-KR"]?.("안녕하세요");
    });
    await screen.findByText("你好");
    fireEvent.click(screen.getByRole("button", { name: "종료하기" }));

    fireEvent.click(screen.getByText("활동 일지 생성하기"));

    expect(await screen.findByDisplayValue(SAMPLE_REPORT.mainContent)).toBeInTheDocument();
    expect(screen.getByDisplayValue(SAMPLE_REPORT.evaluation)).toBeInTheDocument();
    expect(screen.getByDisplayValue(SAMPLE_REPORT.highlight)).toBeInTheDocument();

    // The draft is editable, not just a static readout.
    const mainContentField = screen.getByLabelText("8-1. 이번 주 활동한 주요 교육 내용");
    fireEvent.change(mainContentField, { target: { value: "수정된 내용" } });
    expect(screen.getByDisplayValue("수정된 내용")).toBeInTheDocument();
  });

  it("does not call the summary API when nothing was said", () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "시작하기" }));

    fireEvent.click(screen.getByRole("button", { name: "종료하기" }));

    expect(fetch).not.toHaveBeenCalled();
  });

  it("resumes an ended session, keeping the transcript but dropping the stale report draft", async () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "시작하기" }));
    fireEvent.click(screen.getByText("한국어"));
    act(() => {
      finalResultCallbacks["ko-KR"]?.("안녕하세요");
    });
    await screen.findByText("你好");
    fireEvent.click(screen.getByRole("button", { name: "종료하기" }));
    fireEvent.click(screen.getByText("활동 일지 생성하기"));
    await screen.findByDisplayValue(SAMPLE_REPORT.mainContent);

    expect(screen.queryByRole("button", { name: "시작하기" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "이어서 하기" }));

    expect(screen.getByText("안녕하세요")).toBeInTheDocument();
    expect(screen.queryByDisplayValue(SAMPLE_REPORT.mainContent)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "종료하기" })).toBeInTheDocument();
  });
  it("restores the conversation after a refresh as an ended session that can be resumed", async () => {
    const { unmount } = render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "시작하기" }));
    fireEvent.click(screen.getByText("한국어"));
    act(() => {
      finalResultCallbacks["ko-KR"]?.("안녕하세요");
    });
    await screen.findByText("你好");

    // Refresh mid-session: the mic is gone, but the conversation isn't.
    unmount();
    render(<Home />);

    expect(await screen.findByText("안녕하세요")).toBeInTheDocument();
    expect(screen.getByText("你好")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "종료하기" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "이어서 하기" })).toBeInTheDocument();
  });

  it("deletes a single message from the log, including its saved copy", async () => {
    const { unmount } = render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "시작하기" }));
    fireEvent.click(screen.getByText("한국어"));
    act(() => {
      finalResultCallbacks["ko-KR"]?.("안녕하세요");
    });
    await screen.findByText("你好");
    fireEvent.click(screen.getByText("한국어"));
    fireEvent.click(screen.getByText("中文"));
    act(() => {
      finalResultCallbacks["zh-CN"]?.("你好，老师");
    });
    await screen.findAllByText("안녕하세요");

    // After a refresh no line is held in the big caption, so every line
    // sits in the feed with its own delete button.
    unmount();
    const { unmount: unmountRestored } = render(<Home />);
    const deleteButtons = await screen.findAllByRole("button", { name: "메시지 삭제" });
    expect(deleteButtons).toHaveLength(2);
    fireEvent.click(deleteButtons[0]);

    expect(screen.queryByText("你好")).not.toBeInTheDocument();
    expect(screen.getByText("你好，老师")).toBeInTheDocument();

    unmountRestored();
    render(<Home />);
    expect(await screen.findByText("你好，老师")).toBeInTheDocument();
    expect(screen.queryByText("你好")).not.toBeInTheDocument();
  });

  /** Speaks one Korean line and reloads, so it sits in the feed (not the big caption). */
  async function renderWithLoggedKoreanLine() {
    const { unmount } = render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "시작하기" }));
    fireEvent.click(screen.getByText("한국어"));
    act(() => {
      finalResultCallbacks["ko-KR"]?.("안녕하세요");
    });
    await screen.findByText("你好");
    unmount();
    render(<Home />);
    await screen.findByRole("button", { name: "메시지 수정" });
  }

  it("re-translates an edited message, clearing its old translation right away", async () => {
    await renderWithLoggedKoreanLine();
    const fetchMock = vi.mocked(fetch);
    let finishTranslation: (response: Response) => void = () => {};
    fetchMock.mockImplementationOnce(
      () => new Promise<Response>((resolve) => (finishTranslation = resolve))
    );

    fireEvent.click(screen.getByRole("button", { name: "메시지 수정" }));
    fireEvent.change(screen.getByRole("textbox", { name: "메시지 수정" }), {
      target: { value: "안녕히 가세요" },
    });
    fireEvent.click(screen.getByRole("button", { name: "수정 완료" }));

    expect(screen.getByText("안녕히 가세요")).toBeInTheDocument();
    expect(screen.queryByText("你好")).not.toBeInTheDocument();
    expect(screen.getByText("번역 중...")).toBeInTheDocument();
    const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    expect(lastCall[0]).toBe("/api/translate");
    expect(JSON.parse(lastCall[1]!.body as string)).toEqual({
      text: "안녕히 가세요",
      sourceLang: "ko-KR",
    });

    await act(async () => {
      finishTranslation(new Response(JSON.stringify({ translated: "再见" }), { status: 200 }));
    });
    expect(await screen.findByText("再见")).toBeInTheDocument();
  });

  it("does not re-translate when an edit is cancelled or changes nothing", async () => {
    await renderWithLoggedKoreanLine();
    const fetchMock = vi.mocked(fetch);
    const callsBefore = fetchMock.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "메시지 수정" }));
    fireEvent.change(screen.getByRole("textbox", { name: "메시지 수정" }), {
      target: { value: "다른 문장" },
    });
    fireEvent.click(screen.getByRole("button", { name: "수정 취소" }));
    expect(screen.getByText("안녕하세요")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "메시지 수정" }));
    fireEvent.click(screen.getByRole("button", { name: "수정 완료" }));

    expect(screen.getByText("你好")).toBeInTheDocument();
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });

  it("ignores a translation that arrives for text the message no longer has", async () => {
    await renderWithLoggedKoreanLine();
    const fetchMock = vi.mocked(fetch);
    const pending: Array<(response: Response) => void> = [];
    fetchMock.mockImplementation(
      () => new Promise<Response>((resolve) => pending.push(resolve))
    );
    const edit = (text: string) => {
      fireEvent.click(screen.getByRole("button", { name: "메시지 수정" }));
      fireEvent.change(screen.getByRole("textbox", { name: "메시지 수정" }), {
        target: { value: text },
      });
      fireEvent.click(screen.getByRole("button", { name: "수정 완료" }));
    };

    edit("첫 번째 수정");
    edit("두 번째 수정");
    expect(pending).toHaveLength(2);

    // The newer request answers first, then the outdated one trails in.
    await act(async () => {
      pending[1](new Response(JSON.stringify({ translated: "第二次" }), { status: 200 }));
    });
    await act(async () => {
      pending[0](new Response(JSON.stringify({ translated: "第一次" }), { status: 200 }));
    });

    expect(await screen.findByText("第二次")).toBeInTheDocument();
    expect(screen.queryByText("第一次")).not.toBeInTheDocument();
  });

  it("starts over from an ended session, wiping the conversation and its saved copy", async () => {
    const { unmount } = render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "시작하기" }));
    fireEvent.click(screen.getByText("한국어"));
    act(() => {
      finalResultCallbacks["ko-KR"]?.("안녕하세요");
    });
    await screen.findByText("你好");
    fireEvent.click(screen.getByRole("button", { name: "종료하기" }));
    fireEvent.click(screen.getByText("활동 일지 생성하기"));
    await screen.findByDisplayValue(SAMPLE_REPORT.mainContent);

    fireEvent.click(screen.getByRole("button", { name: "새로 시작" }));

    expect(screen.queryByText("안녕하세요")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue(SAMPLE_REPORT.mainContent)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "종료하기" })).toBeInTheDocument();

    unmount();
    render(<Home />);
    expect(screen.queryByText("안녕하세요")).not.toBeInTheDocument();
  });
  it("translates the utterance in progress right away when the orb is clicked", () => {
    const finalizeNowByLang = { "ko-KR": vi.fn(), "zh-CN": vi.fn() };
    let koInterim = "";
    mockedUseSpeechCaption.mockImplementation(({ lang }) => ({
      interimText: lang === "ko-KR" ? koInterim : "",
      supported: true,
      error: null,
      listening: true,
      finalizeNow: finalizeNowByLang[lang],
    }));

    const { rerender } = render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "시작하기" }));
    fireEvent.click(screen.getByText("한국어"));

    // Nothing being said yet — nothing to translate.
    expect(screen.getByRole("button", { name: "지금 번역하기" })).toBeDisabled();

    koInterim = "안녕하";
    rerender(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "지금 번역하기" }));

    expect(finalizeNowByLang["ko-KR"]).toHaveBeenCalledTimes(1);
    expect(finalizeNowByLang["zh-CN"]).not.toHaveBeenCalled();
    // Ending the session is its own separate control.
    expect(screen.getByRole("button", { name: "종료하기" })).toBeInTheDocument();
  });
  it("fades a removed control out before unmounting it, without leaving it interactive", () => {
    vi.useFakeTimers();
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "시작하기" }));
    fireEvent.click(screen.getByRole("button", { name: "종료하기" }));

    // Still on screen for the fade-out, but already out of reach — not
    // exposed as a button, and inert so it can't be clicked or focused.
    expect(screen.queryByRole("button", { name: "종료하기" })).not.toBeInTheDocument();
    const fading = screen.getByLabelText("종료하기", { selector: "button" });
    expect(fading).toHaveAttribute("inert");

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByLabelText("종료하기", { selector: "button" })).not.toBeInTheDocument();
  });
  it("disables 새로 시작 (but keeps both buttons) while the report is being generated", async () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "시작하기" }));
    fireEvent.click(screen.getByText("한국어"));
    act(() => {
      finalResultCallbacks["ko-KR"]?.("안녕하세요");
    });
    await screen.findByText("你好");
    fireEvent.click(screen.getByRole("button", { name: "종료하기" }));

    fireEvent.click(screen.getByText("활동 일지 생성하기"));
    expect(screen.getByRole("button", { name: "새로 시작" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "이어서 하기" })).toBeEnabled();

    await screen.findByDisplayValue(SAMPLE_REPORT.mainContent);
    expect(screen.getByRole("button", { name: "새로 시작" })).toBeEnabled();
  });

  it("cancels an in-flight report generation when resuming", async () => {
    let summarizeSignal: AbortSignal | undefined;
    let finishSummarize: (() => void) | undefined;
    const baseFetch = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (url !== "/api/summarize") return baseFetch(url, init);
      summarizeSignal = init?.signal ?? undefined;
      // Held open until the test releases it — i.e. a slow report.
      await new Promise<void>((resolve) => {
        finishSummarize = resolve;
      });
      return new Response(JSON.stringify({ report: SAMPLE_REPORT }), { status: 200 });
    });

    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "시작하기" }));
    fireEvent.click(screen.getByText("한국어"));
    act(() => {
      finalResultCallbacks["ko-KR"]?.("안녕하세요");
    });
    await screen.findByText("你好");
    fireEvent.click(screen.getByRole("button", { name: "종료하기" }));
    fireEvent.click(screen.getByText("활동 일지 생성하기"));
    expect(screen.getByText("활동 일지 초안 생성 중...")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "이어서 하기" }));

    expect(summarizeSignal?.aborted).toBe(true);
    expect(screen.queryByText("활동 일지 초안 생성 중...")).not.toBeInTheDocument();

    // Even if the response still arrives, the cancelled draft never shows up.
    await act(async () => {
      finishSummarize?.();
    });
    expect(screen.queryByDisplayValue(SAMPLE_REPORT.mainContent)).not.toBeInTheDocument();
  });
  it("disables the language buttons while a line is being translated", async () => {
    let finishTranslate: (() => void) | undefined;
    const baseFetch = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (url === "/api/translate") {
        await new Promise<void>((resolve) => {
          finishTranslate = resolve;
        });
      }
      return baseFetch(url, init);
    });

    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "시작하기" }));
    fireEvent.click(screen.getByText("한국어"));
    act(() => {
      finalResultCallbacks["ko-KR"]?.("안녕하세요");
    });

    expect(screen.getByRole("button", { name: "한국어" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "中文" })).toBeDisabled();

    await act(async () => {
      finishTranslate?.();
    });
    await screen.findByText("你好");
    expect(screen.getByRole("button", { name: "한국어" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "中文" })).toBeEnabled();
  });
  it("disables the language buttons while speech is being recognized", () => {
    let koInterim = "";
    mockedUseSpeechCaption.mockImplementation(({ lang }) => ({
      interimText: lang === "ko-KR" ? koInterim : "",
      supported: true,
      error: null,
      listening: true,
      finalizeNow: vi.fn(),
    }));

    const { rerender } = render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "시작하기" }));
    fireEvent.click(screen.getByText("한국어"));
    expect(screen.getByRole("button", { name: "中文" })).toBeEnabled();

    koInterim = "안녕하";
    rerender(<Home />);
    expect(screen.getByRole("button", { name: "한국어" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "中文" })).toBeDisabled();

    koInterim = "";
    rerender(<Home />);
    expect(screen.getByRole("button", { name: "中文" })).toBeEnabled();
  });
  it("takes the student name as input, fills it into the form link, and remembers it", async () => {
    const { unmount } = render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "시작하기" }));
    fireEvent.click(screen.getByText("한국어"));
    act(() => {
      finalResultCallbacks["ko-KR"]?.("안녕하세요");
    });
    await screen.findByText("你好");
    fireEvent.click(screen.getByRole("button", { name: "종료하기" }));
    fireEvent.click(screen.getByText("활동 일지 생성하기"));

    const nameField = await screen.findByLabelText("3. 학생명");
    expect(nameField).toHaveValue("");
    fireEvent.change(nameField, { target: { value: "홍길동" } });
    const href = screen.getByRole("link", { name: "구글폼 열기" }).getAttribute("href")!;
    expect(new URL(href).searchParams.get("entry.2077271802")).toBe("홍길동");

    // Same student next time — it's still filled in after a refresh.
    unmount();
    render(<Home />);
    expect(await screen.findByLabelText("3. 학생명")).toHaveValue("홍길동");
  });
});
