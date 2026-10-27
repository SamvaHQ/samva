import { strict as assert } from "node:assert";

import { createClient, MailboxEventStreamError } from "samva";
import type {
  MailboxEvent,
  MailboxEventStreamOptions,
  MailboxSendReceipt,
  MailboxThreadPage,
} from "samva";
import { test, vi } from "vitest";

import { handleEvent, runMailboxAgent } from "../src/agent";
import type { CursorStore } from "../src/agent";

const received = (id: string, overrides: Record<string, unknown> = {}): MailboxEvent => ({
  cursor: `cursor-${id}`,
  id,
  type: "mailbox.message.received",
  timestamp: "2026-10-10T12:00:00.000Z",
  data: {
    mailboxId: "mbx_01",
    message: {
      id: `msg_${id}`,
      from: { address: "ada@example.com" },
      subject: "Invoice question",
      text: "Where is my invoice?",
      ...overrides,
    },
  },
});

const memoryStore = (initial?: string) => {
  let cursor = initial;
  const saved: string[] = [];
  const store: CursorStore = {
    load: async () => cursor,
    save: async (next) => {
      cursor = next;
      saved.push(next);
    },
    clear: async () => {
      cursor = undefined;
    },
  };
  return { store, saved, current: () => cursor };
};

type Stream = (options: MailboxEventStreamOptions) => AsyncIterable<MailboxEvent>;

const of = (...events: MailboxEvent[]): Stream =>
  async function* () {
    yield* events;
  };

const failing = (tag: "CursorExpiredError" | "UnauthorizedError"): Stream =>
  async function* () {
    yield* [] as MailboxEvent[];
    throw new MailboxEventStreamError({ _tag: tag, message: tag });
  };

const sendReceipt = (
  state: MailboxSendReceipt["state"] = "approvalRequired",
): MailboxSendReceipt => ({
  actionId: "mbxact_01",
  state,
  messageId: state === "accepted" || state === "completed" ? "msg_reply" : null,
  acceptedAt: state === "accepted" || state === "completed" ? "2026-10-13T12:00:00.000Z" : null,
  draftId: null,
  threadId: "thr_01",
  executeUntil: state === "approvalRequired" ? null : "2026-10-13T12:15:00.000Z",
  retryAt: null,
  problem: null,
  retryEligible: false,
  decision: null,
  waitReason: null,
  reviewExpectedAt: null,
  skippedRecipients: [],
  createdAt: "2026-10-13T12:00:00.000Z",
  updatedAt: "2026-10-13T12:00:00.000Z",
});

const createHarness = (streams: ReadonlyArray<Stream>) => {
  const replies: Request[] = [];
  const threadQueries: URLSearchParams[] = [];
  const connects: MailboxEventStreamOptions[] = [];
  let next = 0;
  const client = createClient({
    apiKey: "samva_sk_test_mailbox_agent",
    baseUrl: "https://api.samva.test",
    fetch: Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init);
        const url = new URL(request.url);
        if (
          request.method === "POST" &&
          /^\/v1\/mailboxes\/mbx_01\/messages\/[^/]+\/reply$/.test(url.pathname)
        ) {
          replies.push(request);
          return Response.json(sendReceipt(), { status: 201 });
        }
        if (request.method === "GET" && url.pathname === "/v1/mailboxes/mbx_01/threads") {
          threadQueries.push(url.searchParams);
          const page: MailboxThreadPage = {
            items: [
              {
                id: "thr_01",
                channel: "email",
                endpointId: null,
                subject: "Invoice question",
                preview: "Where is my invoice?",
                from: null,
                messageCount: 1,
                hasAttachments: false,
                hasDraft: false,
                folder: "inbox",
                priority: "normal",
                labels: [],
                read: false,
                starred: false,
                snoozedUntil: null,
                lastActivityAt: "2026-10-10T12:00:00.000Z",
              },
            ],
            nextCursor: null,
          };
          return Response.json(page);
        }
        throw new Error(`Unexpected request: ${request.method} ${url}`);
      },
      { preconnect: () => {} },
    ),
  });
  const events = client.mailboxes.events;
  vi.spyOn(client.mailboxes, "events").mockImplementation((options = {}) => {
    connects.push(options);
    const stream = streams[next++];
    assert.ok(stream, "unexpected extra connection");
    const connection = events(options);
    vi.spyOn(connection, Symbol.asyncIterator).mockImplementation(() =>
      stream(options)[Symbol.asyncIterator](),
    );
    return connection;
  });
  return { client, replies, connects, threadQueries };
};

test("replies in approval mode and saves the cursor after handling", async () => {
  const { client, replies } = createHarness([of(received("evt_1"))]);
  const { store, saved } = memoryStore();
  const lines: string[] = [];

  await runMailboxAgent(client, { mailboxId: "mbx_01", store, log: (line) => lines.push(line) });

  assert.equal(replies.length, 1);
  const reply = replies[0];
  assert.ok(reply);
  assert.equal(reply.headers.get("idempotency-key"), "reply:evt_1");
  assert.equal(new URL(reply.url).pathname, "/v1/mailboxes/mbx_01/messages/msg_evt_1/reply");
  assert.deepEqual(await reply.json(), {
    text: 'Thanks for writing about "Invoice question". A person will follow up shortly.',
  });
  assert.deepEqual(saved, ["cursor-evt_1"]);
  assert.match(lines[0] ?? "", /approvalRequired, action mbxact_01/);
});

test("resumes from the stored cursor and scopes the stream to one mailbox", async () => {
  const { client, connects } = createHarness([of()]);
  const { store } = memoryStore("cursor-old");

  await runMailboxAgent(client, { mailboxId: "mbx_01", store, log: () => {} });

  assert.equal(connects[0]?.cursor, "cursor-old");
  assert.deepEqual(connects[0]?.mailboxIds, ["mbx_01"]);
});

test("does not save the cursor when the reply fails", async () => {
  const { client } = createHarness([of(received("evt_1"))]);
  vi.spyOn(client.mailboxes, "reply").mockRejectedValue(new Error("boom"));
  const { store, saved } = memoryStore();

  await assert.rejects(runMailboxAgent(client, { mailboxId: "mbx_01", store, log: () => {} }));
  assert.deepEqual(saved, []);
});

test("skips automated senders but still advances the cursor", async () => {
  const { client, replies } = createHarness([
    of(received("evt_1", { from: { address: "no-reply@example.com" } })),
  ]);
  const { store, saved } = memoryStore();

  await runMailboxAgent(client, { mailboxId: "mbx_01", store, log: () => {} });

  assert.equal(replies.length, 0);
  assert.deepEqual(saved, ["cursor-evt_1"]);
});

test("restarts without a cursor after CursorExpiredError", async () => {
  const { client, connects, replies, threadQueries } = createHarness([
    failing("CursorExpiredError"),
    of(received("evt_9")),
  ]);
  const { store, current } = memoryStore("cursor-stale");
  const lines: string[] = [];

  await runMailboxAgent(client, { mailboxId: "mbx_01", store, log: (line) => lines.push(line) });

  assert.equal(connects[0]?.cursor, "cursor-stale");
  assert.equal(connects[1]?.cursor, undefined);
  assert.equal(replies.length, 1);
  assert.equal(threadQueries.length, 1);
  const query = threadQueries[0];
  assert.ok(query);
  assert.deepEqual(Object.fromEntries(query), { unread: "true", limit: "20" });
  assert.equal(current(), "cursor-evt_9");
  assert.ok(lines.some((line) => line.startsWith("cursor expired: 1 unread")));
});

test("rethrows other stream errors", async () => {
  const { client } = createHarness([failing("UnauthorizedError")]);
  const { store } = memoryStore();

  await assert.rejects(runMailboxAgent(client, { mailboxId: "mbx_01", store, log: () => {} }));
});

test.each(["queued", "accepted", "completed", "notSent", "uncertain"] as const)(
  "logs a %s receipt without claiming recipient delivery",
  async (state) => {
    const { client } = createHarness([]);
    vi.spyOn(client.mailboxes, "reply").mockResolvedValue(sendReceipt(state));
    const lines: string[] = [];

    await handleEvent(client, received("evt_1"), (line) => lines.push(line));

    assert.deepEqual(lines, [`reply to msg_evt_1: ${state}, action mbxact_01`]);
  },
);

test("replays a lost reply response with the same key and body", async () => {
  const { client } = createHarness([]);
  const calls: unknown[] = [];
  vi.spyOn(client.mailboxes, "reply").mockImplementation(async (...args) => {
    calls.push(args);
    if (calls.length === 1) throw new Error("response lost");
    return sendReceipt();
  });
  const event = received("evt_1");

  await assert.rejects(handleEvent(client, event, () => {}));
  await handleEvent(client, event, () => {});

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], calls[1]);
});

test.each(["mailbox.message.delivered", "mailbox.message.read", "mailbox.message.failed"] as const)(
  "advances the cursor for %s without replying",
  async (type) => {
    const event: MailboxEvent = { ...received("evt_delivery"), type };
    const { client, replies } = createHarness([of(event)]);
    const { store, saved } = memoryStore();
    const lines: string[] = [];

    await runMailboxAgent(client, { mailboxId: "mbx_01", store, log: (line) => lines.push(line) });

    assert.deepEqual(replies, []);
    assert.deepEqual(saved, ["cursor-evt_delivery"]);
    assert.deepEqual(lines, []);
  },
);
