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

function makeRequest(body: unknown, headers: Record<string, string> = SAME_ORIGIN_HEADERS) {
  return {
    json: async () => body,
    headers: new Headers(headers),
  } as unknown as NextRequest;
}

describe("POST /api/translate", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("translates Korean speech into Chinese", async () => {
    createMock.mockResolvedValue({
      content: [{ type: "text", text: "你好" }],
    });
    const { POST } = await import("./route");

    const res = await POST(makeRequest({ text: "안녕하세요", sourceLang: "ko-KR" }));
    const data = await res.json();

    expect(data.translated).toBe("你好");
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [expect.objectContaining({ content: expect.stringContaining("안녕하세요") })],
      })
    );
  });

  it("translates Chinese speech into Korean", async () => {
    createMock.mockResolvedValue({
      content: [{ type: "text", text: "안녕하세요" }],
    });
    const { POST } = await import("./route");

    const res = await POST(makeRequest({ text: "你好", sourceLang: "zh-CN" }));
    const data = await res.json();

    expect(data.translated).toBe("안녕하세요");
  });

  it("returns an empty translation without calling the API for blank input", async () => {
    const { POST } = await import("./route");

    const res = await POST(makeRequest({ text: "   ", sourceLang: "ko-KR" }));
    const data = await res.json();

    expect(data.translated).toBe("");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("rejects an oversized utterance without calling the model", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ text: "가".repeat(1_001), sourceLang: "ko-KR" }));
    expect(res.status).toBe(413);
    expect(createMock).not.toHaveBeenCalled();
  });

  describe("rejects untrusted callers before touching the model", () => {
    const body = { text: "안녕하세요", sourceLang: "ko-KR" };

    it("with no Origin (e.g. Postman / curl)", async () => {
      const { POST } = await import("./route");
      const res = await POST(makeRequest(body, { host: "localhost:3000" }));
      expect(res.status).toBe(403);
      expect(createMock).not.toHaveBeenCalled();
    });

    it("from another website's page", async () => {
      const { POST } = await import("./route");
      const res = await POST(
        makeRequest(body, { origin: "https://evil.example", host: "localhost:3000" })
      );
      expect(res.status).toBe(403);
      expect(createMock).not.toHaveBeenCalled();
    });

    it("when BotID classifies it as a bot, even with a matching Origin", async () => {
      checkBotIdMock.mockResolvedValueOnce({ isBot: true });
      const { POST } = await import("./route");
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(403);
      expect(createMock).not.toHaveBeenCalled();
    });
  });
});
