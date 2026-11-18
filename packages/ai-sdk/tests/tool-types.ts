import { generateText, stepCountIs, type LanguageModel, type ToolSet } from "ai";
import { expectTypeOf } from "vitest";

import {
  samvaTools,
  type SamvaLeaveResult,
  type SamvaReplyResult,
  type SamvaToolsOptions,
} from "../src/index";

// Checked by tsgo without running a model or making an HTTP request.
export async function verifyGenerateTextTypes(model: LanguageModel, options: SamvaToolsOptions) {
  const tools = samvaTools(options) satisfies ToolSet;
  const response = await generateText({
    model,
    prompt: "Respond to the customer.",
    tools,
    stopWhen: stepCountIs(3),
  });

  for (const step of response.steps) {
    for (const result of step.toolResults) {
      if (result.dynamic) continue;
      if (result.toolName === "reply_to_customer") {
        expectTypeOf(result.output).toEqualTypeOf<SamvaReplyResult>();
      }
      if (result.toolName === "leave_for_person") {
        expectTypeOf(result.output).toEqualTypeOf<SamvaLeaveResult>();
      }
    }
  }
}
