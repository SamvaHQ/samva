type Claim = "acted" | "replyUnknown";

const claims = new Map<string, Claim>();
const LIMIT = 1000;

/**
 * Claim an event for one action. The first tool call for an event wins, so a model that calls
 * both tools in one step cannot submit a reply and also leave the message for a person. The
 * claim is taken synchronously, before any request starts.
 *
 * After a reply whose outcome is unknown, only another reply may claim the event: the reply key
 * makes that retry safe, while leaving the message for a person could hide a reply that was
 * recorded.
 */
export const claimEvent = (eventId: string, action: "reply" | "leave"): boolean => {
  const held = claims.get(eventId);
  if (held === "acted" || (held === "replyUnknown" && action === "leave")) return false;
  claims.set(eventId, "acted");
  // Sessions are short-lived, so only recent events can be claimed twice.
  if (claims.size > LIMIT) claims.delete(claims.keys().next().value as string);
  return true;
};

/**
 * Release a claim whose reply Samva refused, so nothing was recorded and either tool may act.
 * Eve hands a tool's error back to the model, which may call a tool again.
 */
export const releaseEvent = (eventId: string): void => {
  claims.delete(eventId);
};

/** Keep the event for a reply retry when a reply failed without an answer from Samva. */
export const holdForReplyRetry = (eventId: string): void => {
  claims.set(eventId, "replyUnknown");
};

/** Forget every claim. Tests call this between cases. */
export const forgetClaims = (): void => claims.clear();
