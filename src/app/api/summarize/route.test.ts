// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const createMock = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: createMock };
  },
}));

// BotID only works against a real deployment; here it's a switch the tests
// flip. Defaults to "not a bot".
const checkBotIdMock = vi.fn(async () => ({ isBot: false }));

vi.mock("botid/server", () => ({
  checkBotId: () => checkBotIdMock(),
}));

// What a fetch from our own page looks like: Origin matches Host.
const SAME_ORIGIN_HEADERS = { origin: "http://localhost:3000", host: "localhost:3000" };

function makeRequest(
  body: unknown,
  {
    headers = SAME_ORIGIN_HEADERS,
    signal = new AbortController().signal,
  }: { headers?: Record<string, string>; signal?: AbortSignal } = {}
) {
  return {
    json: async () => body,
    headers: new Headers(headers),
    signal,
  } as unknown as NextRequest;
}

const SAMPLE_REPORT = {
  mainContent: "인사말과 자기소개 표현을 연습했다.",
  evaluation: "적극적으로 참여했고 발음이 좋아졌다.",
  highlight: "학생이 스스로 문장을 만들어 말한 순간이 인상 깊었다.",
  gratitude: "",
};

describe("POST /api/summarize", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("returns a canned report without calling the API when MOCK_SUMMARIZE is on", async () => {
    vi.stubEnv("MOCK_SUMMARIZE", "true");
    vi.useFakeTimers();
    const { POST } = await import("./route");

    const pending = POST(
      makeRequest({
        transcript: [
          { speaker: "나", text: "안녕하세요" },
          { speaker: "학생", text: "你好" },
        ],
      })
    );
    await vi.advanceTimersByTimeAsync(3000);
    const data = await (await pending).json();

    expect(createMock).not.toHaveBeenCalled();
    expect(data.report.mainContent).toContain("[테스트 초안]");
    expect(data.report.mainContent).toContain("안녕하세요");
  });

  it("generates the 4-field activity report from a transcript", async () => {
    createMock.mockResolvedValue({
      content: [{ type: "tool_use", name: "submit_activity_report", input: SAMPLE_REPORT }],
    });
    const { POST } = await import("./route");

    const res = await POST(
      makeRequest({
        transcript: [
          { speaker: "나", text: "안녕하세요" },
          { speaker: "학생", text: "你好，老师" },
        ],
      })
    );
    const data = await res.json();

    expect(data.report).toEqual(SAMPLE_REPORT);
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tool_choice: { type: "tool", name: "submit_activity_report" },
        messages: [
          expect.objectContaining({
            content: expect.stringContaining("나: 안녕하세요"),
          }),
        ],
      }),
      // Request options — carries the client's abort signal.
      expect.anything()
    );
  });

  it("returns an empty report without calling the API for an empty transcript", async () => {
    const { POST } = await import("./route");

    const res = await POST(makeRequest({ transcript: [] }));
    const data = await res.json();

    expect(data.report).toEqual({
      mainContent: "",
      evaluation: "",
      highlight: "",
      gratitude: "",
    });
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns an error if the model doesn't respond with the expected tool call", async () => {
    createMock.mockResolvedValue({
      content: [{ type: "text", text: "죄송합니다, 다시 시도해주세요." }],
    });
    const { POST } = await import("./route");

    const res = await POST(
      makeRequest({ transcript: [{ speaker: "나", text: "안녕하세요" }] })
    );
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toContain("형식으로 응답하지 않았습니다");
  });

  it("stops the model call when the client cancels the request", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const { POST } = await import("./route");
    const controller = new AbortController();
    createMock.mockImplementationOnce((_params, options: { signal: AbortSignal }) => {
      expect(options.signal).toBe(controller.signal);
      controller.abort();
      return Promise.reject(new Error("Request was aborted."));
    });

    const res = await POST(
      makeRequest(
        { transcript: [{ speaker: "나", text: "안녕하세요" }] },
        { signal: controller.signal }
      )
    );

    expect(res.status).toBe(499);
  });

  it("rejects untrusted callers before touching the model", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const { POST } = await import("./route");
    const body = { transcript: [{ speaker: "나", text: "안녕하세요" }] };

    const crossOrigin = await POST(
      makeRequest(body, { headers: { origin: "https://evil.example", host: "localhost:3000" } })
    );
    checkBotIdMock.mockResolvedValueOnce({ isBot: true });
    const bot = await POST(makeRequest(body));

    expect(crossOrigin.status).toBe(403);
    expect(bot.status).toBe(403);
    expect(createMock).not.toHaveBeenCalled();
  });
});
