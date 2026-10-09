import { strict as assert } from "node:assert";

import { MailboxEventStreamError } from "samva";
import type { MailboxEvent, MailboxEventStreamOptions } from "samva";
import { test } from "vitest";

import { runMailboxAgent } from "../src/agent";
import type { CursorStore, MailboxAgentClient } from "../src/agent";

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

const createHarness = (streams: ReadonlyArray<Stream>) => {
  const replies: Array<Record<string, unknown>> = [];
  const connects: MailboxEventStreamOptions[] = [];
  let next = 0;
  const client: MailboxAgentClient = {
    mailboxes: {
      events: (options = {}) => {
        connects.push(options);
        const stream = streams[next++];
        assert.ok(stream, "unexpected extra connection");
        return stream(options);
      },
      reply: async (params) => {
        replies.push(params);
        return { status: "pending_approval", actionId: "mbxact_01" };
      },
      listThreads: async () => ({ items: [{ id: "thr_01" }] }),
    },
  };
  return { client, replies, connects };
};

test("replies in approval mode and saves the cursor after handling", async () => {
  const { client, replies } = createHarness([of(received("evt_1"))]);
  const { store, saved } = memoryStore();
  const lines: string[] = [];

  await runMailboxAgent(client, { mailboxId: "mbx_01", store, log: (line) => lines.push(line) });

  assert.equal(replies.length, 1);
  assert.equal(replies[0]?.["idempotency-key"], "reply:evt_1");
  assert.equal(replies[0]?.messageId, "msg_evt_1");
  assert.deepEqual(saved, ["cursor-evt_1"]);
  assert.match(lines[0] ?? "", /waits for approval: action mbxact_01/);
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
  client.mailboxes.reply = async () => {
    throw new Error("boom");
  };
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
  const { client, connects, replies } = createHarness([
    failing("CursorExpiredError"),
    of(received("evt_9")),
  ]);
  const { store, current } = memoryStore("cursor-stale");
  const lines: string[] = [];

  await runMailboxAgent(client, { mailboxId: "mbx_01", store, log: (line) => lines.push(line) });

  assert.equal(connects[0]?.cursor, "cursor-stale");
  assert.equal(connects[1]?.cursor, undefined);
  assert.equal(replies.length, 1);
  assert.equal(current(), "cursor-evt_9");
  assert.ok(lines.some((line) => line.startsWith("cursor expired: 1 unread")));
});

test("rethrows other stream errors", async () => {
  const { client } = createHarness([failing("UnauthorizedError")]);
  const { store } = memoryStore();

  await assert.rejects(runMailboxAgent(client, { mailboxId: "mbx_01", store, log: () => {} }));
});
