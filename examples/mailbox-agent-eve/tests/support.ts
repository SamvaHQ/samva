import type { MailboxEvent } from "samva";

export const received = (overrides: Record<string, unknown> = {}): MailboxEvent => ({
  cursor: "cursor-1",
  id: "evt_1",
  type: "mailbox.message.received",
  timestamp: "2026-10-10T12:00:00.000Z",
  data: {
    mailboxId: "mbx_01",
    message: {
      id: "msg_1",
      from: { address: "ada@example.com" },
      subject: "Where is my order?",
      text: "Order 1042 has not arrived.",
      ...overrides,
    },
  },
});

export const receipt = {
  actionId: "mbxact_01",
  state: "approvalRequired",
  messageId: null,
  acceptedAt: null,
  draftId: null,
  threadId: "thr_01",
  executeUntil: null,
  retryAt: null,
  problem: null,
  retryEligible: false,
  decision: null,
  waitReason: null,
  reviewExpectedAt: null,
  skippedRecipients: [],
  createdAt: "2026-10-13T12:00:00.000Z",
  updatedAt: "2026-10-13T12:00:00.000Z",
};

/** A fetch that records every request and answers with `respond`. */
export const recordingFetch = (respond: () => Response = () => Response.json(receipt)) => {
  const requests: Request[] = [];
  const fetchImpl = Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(new Request(input, init));
      return respond();
    },
    { preconnect: () => {} },
  );
  return { requests, fetch: fetchImpl };
};
