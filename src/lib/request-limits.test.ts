// @vitest-environment node
import type { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import {
  MAX_BODY_BYTES,
  MAX_TRANSCRIPT_CHARS,
  MAX_TRANSCRIPT_LINES,
  MAX_UTTERANCE_CHARS,
  parseSummarizeBody,
  parseTranslateBody,
} from "./request-limits";

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return {
    headers: new Headers(headers),
    json: async () => {
      if (body instanceof Error) throw body;
      return body;
    },
  } as unknown as NextRequest;
}

describe("parseTranslateBody", () => {
  it("accepts a normal utterance", async () => {
    const parsed = await parseTranslateBody(makeRequest({ text: "안녕하세요", sourceLang: "ko-KR" }));
    expect(parsed).toEqual({ ok: true, value: { text: "안녕하세요", sourceLang: "ko-KR" } });
  });

  it("accepts an utterance right at the limit", async () => {
    const parsed = await parseTranslateBody(
      makeRequest({ text: "가".repeat(MAX_UTTERANCE_CHARS), sourceLang: "zh-CN" })
    );
    expect(parsed.ok).toBe(true);
  });

  it("rejects an utterance over the limit with 413", async () => {
    const parsed = await parseTranslateBody(
      makeRequest({ text: "가".repeat(MAX_UTTERANCE_CHARS + 1), sourceLang: "ko-KR" })
    );
    expect(parsed).toMatchObject({ ok: false, status: 413 });
  });

  it.each([
    ["an unknown language", { text: "hi", sourceLang: "en-US" }],
    ["a non-string text", { text: 123, sourceLang: "ko-KR" }],
    ["a missing body", null],
  ])("rejects %s with 400", async (_label, body) => {
    const parsed = await parseTranslateBody(makeRequest(body));
    expect(parsed).toMatchObject({ ok: false, status: 400 });
  });

  it("rejects malformed JSON with 400", async () => {
    const parsed = await parseTranslateBody(makeRequest(new SyntaxError("bad json")));
    expect(parsed).toMatchObject({ ok: false, status: 400 });
  });

  it("rejects an oversized body by Content-Length without reading it", async () => {
    const parsed = await parseTranslateBody(
      makeRequest(new Error("should not be read"), { "content-length": String(MAX_BODY_BYTES + 1) })
    );
    expect(parsed).toMatchObject({ ok: false, status: 413 });
  });
});

describe("parseSummarizeBody", () => {
  const line = (text: string) => ({ speaker: "나", text });

  it("accepts a normal transcript (and an empty one)", async () => {
    expect((await parseSummarizeBody(makeRequest({ transcript: [line("안녕")] }))).ok).toBe(true);
    expect((await parseSummarizeBody(makeRequest({ transcript: [] }))).ok).toBe(true);
  });

  it("rejects too many lines with 413", async () => {
    const transcript = Array.from({ length: MAX_TRANSCRIPT_LINES + 1 }, () => line("a"));
    expect(await parseSummarizeBody(makeRequest({ transcript }))).toMatchObject({
      ok: false,
      status: 413,
    });
  });

  it("rejects too many characters in total with 413", async () => {
    const transcript = [line("가".repeat(MAX_TRANSCRIPT_CHARS)), line("가")];
    expect(await parseSummarizeBody(makeRequest({ transcript }))).toMatchObject({
      ok: false,
      status: 413,
    });
  });

  it.each([
    ["a non-array transcript", { transcript: "안녕" }],
    ["an unknown speaker", { transcript: [{ speaker: "선생님", text: "안녕" }] }],
    ["a non-string line", { transcript: [{ speaker: "학생", text: null }] }],
  ])("rejects %s with 400", async (_label, body) => {
    expect(await parseSummarizeBody(makeRequest(body))).toMatchObject({ ok: false, status: 400 });
  });
});
