import { defineEnvVars } from "@sveltejs/kit/env";

const optionalSecret = (value: string | undefined): string | undefined =>
  value ? value : undefined;

export const variables = defineEnvVars({
  SAMVA_API_KEY: {
    description: "Server-only Samva API key. Copy .env.example to .env.",
    schema: optionalSecret,
  },
  SAMVA_SEND_TOKEN: {
    description: "Bearer token required by POST /api/send.",
    schema: optionalSecret,
  },
});
