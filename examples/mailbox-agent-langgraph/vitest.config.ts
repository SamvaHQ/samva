import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/.turbo/**", "**/coverage/**"],
    // LangChain sends traces to LangSmith when any of these is "true" in the developer's shell.
    env: {
      LANGSMITH_TRACING: "false",
      LANGSMITH_TRACING_V2: "false",
      LANGCHAIN_TRACING: "false",
      LANGCHAIN_TRACING_V2: "false",
    },
  },
});
