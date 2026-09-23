/**
 * A short id generated per API call so a failure shown in the browser can be
 * grep'd straight to the matching request in the `next dev` terminal log —
 * both sides log lines tagged `[route][traceId]`.
 */
export function createTraceId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().slice(0, 8);
  }
  return Math.random().toString(36).slice(2, 10);
}
