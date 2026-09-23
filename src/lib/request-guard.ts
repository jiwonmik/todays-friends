import { checkBotId } from "botid/server";
import { NextResponse, type NextRequest } from "next/server";

/**
 * True when the request says it came from a page on this same site. Browsers
 * always attach `Origin` to a POST `fetch` and pages can't forge it, so this
 * stops another website's page from calling our API. It does NOT stop
 * Postman/curl/scripts (they can write any Origin they like) — that's what
 * BotID is for.
 */
export function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * Gate for the AI routes, run before the request body is even read so a
 * rejected request never reaches the model:
 * 1. Origin — rejects calls from other websites.
 * 2. BotID — rejects anything that isn't a real browser running our page
 *    (Postman, curl, scripts). The page opts these routes in via
 *    `initBotId` in src/instrumentation-client.ts. Always passes in local
 *    development (BotID's own behavior).
 *
 * Returns the 403 response to send back, or null to let the request through.
 */
export async function rejectUntrustedRequest(
  req: NextRequest,
  traceId: string,
  log: (...args: unknown[]) => void
): Promise<NextResponse | null> {
  if (!isSameOrigin(req)) {
    log("rejected: cross-origin or missing Origin", { origin: req.headers.get("origin") });
    return NextResponse.json({ error: "허용되지 않은 요청입니다.", traceId }, { status: 403 });
  }

  const { isBot } = await checkBotId();
  if (isBot) {
    log("rejected: BotID classified the request as a bot");
    return NextResponse.json({ error: "허용되지 않은 요청입니다.", traceId }, { status: 403 });
  }

  return null;
}
