import { defineAgent } from "eve";
import { anthropic } from "eve/models/anthropic";

// Any model Eve supports can replace this line. `anthropic()` reads ANTHROPIC_API_KEY.
export default defineAgent({
  model: anthropic("claude-opus-5-5"),
});
