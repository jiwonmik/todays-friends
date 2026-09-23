import { initBotId } from "botid/client/core";

// BotID runs an invisible browser check on this page and attaches its result
// to fetches of the routes listed here; the routes verify it server-side with
// checkBotId() (see src/lib/request-guard.ts). A route missing from this list
// fails that check, so keep it in sync with the routes that call it.
initBotId({
  protect: [
    { path: "/api/translate", method: "POST" },
    { path: "/api/summarize", method: "POST" },
  ],
});
