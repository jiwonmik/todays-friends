import { withBotId } from "botid/next/config";
import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
};

// withBotId adds the rewrites BotID's client check needs (see
// src/instrumentation-client.ts).
export default withBotId(nextConfig);
