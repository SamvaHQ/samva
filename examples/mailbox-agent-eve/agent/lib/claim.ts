const claimed = new Set<string>();
const LIMIT = 1000;

/**
 * Claim an event for one action. The first tool call for an event wins, so a model that calls
 * both tools in one step cannot submit a reply and also leave the message for a person. The
 * claim is taken synchronously, before any request starts.
 */
export const claimEvent = (eventId: string): boolean => {
  if (claimed.has(eventId)) return false;
  claimed.add(eventId);
  // Sessions are short-lived, so only recent events can be claimed twice.
  if (claimed.size > LIMIT) claimed.delete(claimed.values().next().value as string);
  return true;
};

/** Forget every claim. Tests call this between cases. */
export const forgetClaims = (): void => claimed.clear();
