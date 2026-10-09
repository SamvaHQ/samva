import { strict as assert } from "node:assert";

import { createTestClient, mailboxEvent, runExtension } from "@samva/mailbox/test";
import { test } from "vitest";

import extension from "../src/extension";

const receivedEvent = (from = "ada@example.com") =>
  mailboxEvent("mailbox.message.received", {
    mailboxId: "mbx_01",
    message: {
      id: "msg_01",
      threadId: "thr_01",
      from: { address: from },
      to: ["support@acme.samva.email"],
      cc: [],
      subject: "Invoice question",
      text: "Where is my invoice?",
      replyText: null,
      attachments: [],
      occurredAt: "2026-10-10T12:00:00.000Z",
    },
  });

test("declares least-privilege webhook permissions", () => {
  assert.equal(extension.manifest.runtime, "webhook");
  assert.deepEqual(extension.manifest.events, ["mailbox.message.received"]);
  assert.deepEqual(extension.manifest.permissions, ["read", "send"]);
});

test("replies to the received message with an event-derived idempotency key", async () => {
  const event = receivedEvent();
  const client = createTestClient({
    "POST /v1/mailboxes/mbx_01/messages/msg_01/reply": {
      actionId: "mbxact_01",
      status: "pending_approval",
    },
  });

  const result = await runExtension(extension, event, { client });

  assert.equal(result.ok, true);
  assert.equal(result.calls.length, 1);
  const [call] = result.calls;
  assert.equal(call?.method, "POST");
  assert.equal(call?.path, "/v1/mailboxes/mbx_01/messages/msg_01/reply");
  assert.equal(call?.idempotencyKey, `${event.id}:reply:1`);
  assert.deepEqual(result.logs, ["pending_approval mbxact_01"]);
});

test("does not reply to an automated sender", async () => {
  const result = await runExtension(extension, receivedEvent("no-reply@example.com"), {
    client: createTestClient(),
  });

  assert.equal(result.ok, true);
  assert.equal(result.calls.length, 0);
});
