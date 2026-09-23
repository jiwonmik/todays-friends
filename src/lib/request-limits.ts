import type { NextRequest } from "next/server";

/*
 * Size/shape limits for the AI routes' request bodies. BotID keeps out
 * Postman/curl/scripts, but a request that does get through should never be
 * able to cost more than a normal one — these cap what a single call can
 * send to the model. Each limit sits well above real use:
 *
 * - One utterance: continuous speech is finalized at every pause, so even a
 *   long sentence is a few hundred characters; 1,000 is ~2 minutes nonstop.
 * - A session: an hour is roughly 400 lines / 8,000 characters; the caps
 *   below cover several hours.
 */
export const MAX_BODY_BYTES = 256 * 1024;
export const MAX_UTTERANCE_CHARS = 1_000;
export const MAX_TRANSCRIPT_LINES = 2_000;
export const MAX_TRANSCRIPT_CHARS = 50_000;

export type SourceLang = "ko-KR" | "zh-CN";

export interface SpokenLine {
  speaker: "나" | "학생";
  text: string;
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; status: 400 | 413; error: string };

const SOURCE_LANGS = new Set<unknown>(["ko-KR", "zh-CN"]);
const SPEAKERS = new Set<unknown>(["나", "학생"]);

const invalid = (error: string) => ({ ok: false, status: 400, error }) as const;
const tooLarge = (error: string) => ({ ok: false, status: 413, error }) as const;

async function readJson(req: NextRequest): Promise<Parsed<unknown>> {
  // Checked before parsing, so an oversized body is refused without being
  // read into memory first.
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return tooLarge("요청이 너무 큽니다.");
  try {
    return { ok: true, value: await req.json() };
  } catch {
    return invalid("요청 형식이 올바르지 않습니다.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function parseTranslateBody(
  req: NextRequest
): Promise<Parsed<{ text: string; sourceLang: SourceLang }>> {
  const body = await readJson(req);
  if (!body.ok) return body;
  const { value } = body;
  if (!isRecord(value) || typeof value.text !== "string" || !SOURCE_LANGS.has(value.sourceLang)) {
    return invalid("요청 형식이 올바르지 않습니다.");
  }
  if (value.text.length > MAX_UTTERANCE_CHARS) {
    return tooLarge(`번역할 문장이 너무 깁니다 (최대 ${MAX_UTTERANCE_CHARS}자).`);
  }
  return { ok: true, value: { text: value.text, sourceLang: value.sourceLang as SourceLang } };
}

export async function parseSummarizeBody(
  req: NextRequest
): Promise<Parsed<{ transcript: SpokenLine[] }>> {
  const body = await readJson(req);
  if (!body.ok) return body;
  const { value } = body;
  if (!isRecord(value) || !Array.isArray(value.transcript)) {
    return invalid("요청 형식이 올바르지 않습니다.");
  }
  const transcript: unknown[] = value.transcript;
  if (transcript.length > MAX_TRANSCRIPT_LINES) {
    return tooLarge(`대화가 너무 깁니다 (최대 ${MAX_TRANSCRIPT_LINES}줄).`);
  }
  let totalChars = 0;
  for (const line of transcript) {
    if (!isRecord(line) || !SPEAKERS.has(line.speaker) || typeof line.text !== "string") {
      return invalid("요청 형식이 올바르지 않습니다.");
    }
    totalChars += line.text.length;
  }
  if (totalChars > MAX_TRANSCRIPT_CHARS) {
    return tooLarge(`대화가 너무 깁니다 (최대 ${MAX_TRANSCRIPT_CHARS}자).`);
  }
  return { ok: true, value: { transcript: transcript as SpokenLine[] } };
}
