import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { EMPTY_ACTIVITY_REPORT, type ActivityReportDraft } from "@/lib/activity-report";
import { rejectUntrustedRequest } from "@/lib/request-guard";
import { parseSummarizeBody, type SpokenLine as TranscriptLine } from "@/lib/request-limits";
import { createTraceId } from "@/lib/trace";

const REPORT_TOOL_NAME = "submit_activity_report";

// MOCK_SUMMARIZE=true (in .env) skips the Anthropic API entirely and
// returns a canned draft built from the transcript — for exercising the
// report UI/Google Form flow without spending API calls. The short delay
// keeps the "생성 중" state visible like a real request would.
const MOCK_DELAY_MS = 3000;

function buildMockReport(transcript: TranscriptLine[]): ActivityReportDraft {
  const mine = transcript.filter((line) => line.speaker === "나").length;
  const first = transcript[0].text;
  return {
    mainContent: `[테스트 초안] 대화 ${transcript.length}줄 (나 ${mine}줄, 학생 ${transcript.length - mine}줄). 첫 발화: "${first}"`,
    evaluation: "[테스트 초안] MOCK_SUMMARIZE가 켜져 있어 실제 요약 요청을 보내지 않았습니다.",
    highlight: "[테스트 초안] 인상 깊었던 장면이 여기에 들어갑니다.",
    gratitude: "",
  };
}

export async function POST(req: NextRequest) {
  const traceId = req.headers.get("x-trace-id") ?? createTraceId();
  const log = (...args: unknown[]) => console.log(`[summarize][${traceId}]`, ...args);
  const logError = (...args: unknown[]) => console.error(`[summarize][${traceId}]`, ...args);

  const rejected = await rejectUntrustedRequest(req, traceId, log);
  if (rejected) return rejected;

  const parsed = await parseSummarizeBody(req);
  if (!parsed.ok) {
    log("rejected:", parsed.error);
    return NextResponse.json({ error: parsed.error, traceId }, { status: parsed.status });
  }
  const { transcript } = parsed.value;
  log("request received", { lines: transcript.length });

  if (transcript.length === 0) {
    log("empty transcript, skipping report generation");
    return NextResponse.json({ report: EMPTY_ACTIVITY_REPORT, traceId });
  }

  if (process.env.MOCK_SUMMARIZE === "true") {
    log("MOCK_SUMMARIZE is on, returning a canned report without calling the API");
    await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY_MS));
    return NextResponse.json({ report: buildMockReport(transcript), traceId });
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

  const script = transcript.map((line) => `${line.speaker}: ${line.text}`).join("\n");

  try {
    // Constructed per-request (not at module scope) so a missing/invalid key
    // surfaces as this handler's own error response instead of crashing the
    // whole route module at import time.
    const anthropic = new Anthropic();
    const message = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1200,
      system:
        "너는 1:1 한중 과외 봉사(프렌즈 멘토링) 활동 일지를 작성하는 보조야. " +
        "주어진 대화 스크립트(한국어 발화는 '나', 중국어 발화는 '학생')를 바탕으로 " +
        "활동 일지 양식의 4개 항목을 각각 한국어로 작성해줘. " +
        "각 항목은 실제 대화 내용에 근거해서 구체적으로 쓰고, 대화에 없는 내용을 지어내지 마. " +
        "특히 '감사 혹은 기도 제목'은 대화에서 명확히 드러나는 내용이 없으면 " +
        "지어내지 말고 빈 문자열로 남겨.",
      messages: [{ role: "user", content: script }],
      tools: [
        {
          name: REPORT_TOOL_NAME,
          description: "작성한 활동 일지 4개 항목을 제출한다.",
          input_schema: {
            type: "object",
            properties: {
              mainContent: {
                type: "string",
                description: "8-1. 이번 주 활동한 주요 교육 내용 (다룬 주제, 학습 내용 위주 2~4문장)",
              },
              evaluation: {
                type: "string",
                description: "8-2. 이번 주 활동에 대한 전반적 평가 (진행도, 태도, 특이사항 위주 2~4문장)",
              },
              highlight: {
                type: "string",
                description: "9. 가장 인상 깊었던 대화 혹은 활동 (구체적인 한 장면, 1~3문장)",
              },
              gratitude: {
                type: "string",
                description:
                  "10. 활동 중 느낀 감사 혹은 기도 제목. 대화에서 명확히 드러나지 않으면 빈 문자열.",
              },
            },
            required: ["mainContent", "evaluation", "highlight", "gratitude"],
          },
        },
      ],
      tool_choice: { type: "tool", name: REPORT_TOOL_NAME },
    },
    // The client aborts this request when the user resumes or starts over
    // mid-generation — stop the model call too instead of paying for a
    // report nobody will see.
    { signal: req.signal });

    const toolUse = message.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );

    if (!toolUse) {
      throw new Error("모델이 활동 일지 형식으로 응답하지 않았습니다.");
    }

    const report = toolUse.input as ActivityReportDraft;

    log("report generation succeeded");
    return NextResponse.json({ report, traceId });
  } catch (err) {
    if (req.signal?.aborted) {
      log("request cancelled by the client");
      return new NextResponse(null, { status: 499 });
    }
    logError("Anthropic API call failed:", err);
    const detail = err instanceof Error ? err.message : "알 수 없는 오류";
    return NextResponse.json({ error: `요약 요청 실패: ${detail}`, traceId }, { status: 500 });
  }
}
