import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { rejectUntrustedRequest } from "@/lib/request-guard";
import { parseTranslateBody } from "@/lib/request-limits";
import { createTraceId } from "@/lib/trace";

export async function POST(req: NextRequest) {
  const traceId = req.headers.get("x-trace-id") ?? createTraceId();
  const log = (...args: unknown[]) => console.log(`[translate][${traceId}]`, ...args);
  const logError = (...args: unknown[]) => console.error(`[translate][${traceId}]`, ...args);

  const rejected = await rejectUntrustedRequest(req, traceId, log);
  if (rejected) return rejected;

  const parsed = await parseTranslateBody(req);
  if (!parsed.ok) {
    log("rejected:", parsed.error);
    return NextResponse.json({ error: parsed.error, traceId }, { status: parsed.status });
  }
  const { text, sourceLang } = parsed.value;
  log("request received", { sourceLang, textLength: text.length });

  if (!text.trim()) {
    log("empty text, skipping translation");
    return NextResponse.json({ translated: "", traceId });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    logError("ANTHROPIC_API_KEY is not set");
    return NextResponse.json(
      {
        error:
          "서버에 ANTHROPIC_API_KEY가 설정되어 있지 않습니다. .env.local에 키를 넣고 dev 서버를 재시작해주세요.",
        traceId,
      },
      { status: 500 }
    );
  }

  const targetLabel = sourceLang === "ko-KR" ? "중국어(간체)" : "한국어";

  try {
    // Constructed per-request (not at module scope) so a missing/invalid key
    // surfaces as this handler's own error response instead of crashing the
    // whole route module at import time.
    const anthropic = new Anthropic();
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system:
        "You are a real-time interpreter for a 1:1 Korean-Chinese tutoring session. " +
        "Translate the given utterance naturally and concisely. " +
        "Output ONLY the translation, no explanations, no quotes.",
      messages: [
        {
          role: "user",
          content: `다음 문장을 ${targetLabel}로 번역해줘:\n${text}`,
        },
      ],
    });

    const translated = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();

    log("translation succeeded", { translatedLength: translated.length });
    return NextResponse.json({ translated, traceId });
  } catch (err) {
    logError("Anthropic API call failed:", err);
    const detail = err instanceof Error ? err.message : "알 수 없는 오류";
    return NextResponse.json({ error: `번역 요청 실패: ${detail}`, traceId }, { status: 500 });
  }
}
