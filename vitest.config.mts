import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    exclude: ["e2e/**", "node_modules/**"],
    env: {
      // Anthropic SDK is always mocked in tests; this just satisfies the
      // route handlers' own "is the key configured" check.
      ANTHROPIC_API_KEY: "test-key",
      // Any value works — tests only check that the pre-filled link is built.
      NEXT_PUBLIC_ACTIVITY_FORM_ID: "test-form-id",
    },
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
});
