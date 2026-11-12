import { strict as assert } from "node:assert";

import type { ToolContext } from "eve/tools";
import { afterEach, beforeEach, test, vi } from "vitest";

import { forgetClaims } from "../agent/lib/claim";
import leaveForPerson from "../agent/tools/leave_for_person";
import replyToCustomer from "../agent/tools/reply_to_customer";
import { receipt, recordingFetch } from "./support";

/** The tools read only `ctx.channel.metadata`, so the test builds just that. */
const ctxFor = (metadata: Record<string, unknown>) =>
  ({ channel: { kind: "channel:samva", metadata } }) as unknown as ToolContext;

const runReply = async (text: string, ctx: ToolContext) =>
  await replyToCustomer.execute({ text }, ctx);

const emailRef = { eventId: "evt_1", mailboxId: "mbx_01", messageId: "msg_1", channel: "email" };

beforeEach(() => {
  forgetClaims();
  vi.stubEnv("SAMVA_API_KEY", "samva_sk_test_mailbox_agent");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("both tools end the turn", () => {
  assert.equal(replyToCustomer.endsTurn, true);
  assert.equal(leaveForPerson.endsTurn, true);
});

test("replies to an email with the ids from channel state, keyed by the event id", async () => {
  const { requests, fetch } = recordingFetch();
  vi.stubGlobal("fetch", fetch);

  const result = await runReply("It ships today.", ctxFor(emailRef));

  assert.deepEqual(result, { state: "approvalRequired", actionId: "mbxact_01" });
  assert.equal(requests.length, 1);
  assert.equal(new URL(requests[0]!.url).pathname, "/v1/mailboxes/mbx_01/messages/msg_1/reply");
  assert.equal(requests[0]!.headers.get("idempotency-key"), "reply:evt_1");
  assert.deepEqual(await requests[0]!.json(), { text: "It ships today." });
});

test("answers WhatsApp through the same tool, naming the channel", async () => {
  const { requests, fetch } = recordingFetch();
  vi.stubGlobal("fetch", fetch);

  await runReply("It ships today.", ctxFor({ ...emailRef, channel: "whatsapp" }));

  assert.deepEqual(await requests[0]!.json(), { channel: "whatsapp", text: "It ships today." });
});

test("leaving the message for a person sends nothing", async () => {
  const { requests, fetch } = recordingFetch();
  vi.stubGlobal("fetch", fetch);

  const result = await leaveForPerson.execute({ reason: "Asks for a refund." }, ctxFor(emailRef));

  assert.deepEqual(result, { left: true, messageId: "msg_1", reason: "Asks for a refund." });
  assert.equal(requests.length, 0);
});

test("treats a replayed event whose new reply differs as already answered", async () => {
  // Samva refuses a different body under an idempotency key it has seen.
  const { fetch } = recordingFetch(() =>
    Response.json(
      {
        _tag: "MailboxSendConflictError",
        message: "Idempotency-Key reused with a different request.",
        resource: "MailboxAction",
        id: receipt.actionId,
        receipt,
      },
      { status: 409 },
    ),
  );
  vi.stubGlobal("fetch", fetch);

  const result = await runReply("A second draft.", ctxFor(emailRef));

  assert.deepEqual(result, { state: "alreadyAnswered", actionId: "mbxact_01" });
});

test("does not treat a paused mailbox as answered", async () => {
  // A plain conflict recorded no reply, so the event stays unhandled.
  const { fetch } = recordingFetch(() =>
    Response.json(
      {
        _tag: "ConflictError",
        message: "This mailbox is paused. Resume it before submitting a new send.",
        resource: "Mailbox",
      },
      { status: 409 },
    ),
  );
  vi.stubGlobal("fetch", fetch);

  await assert.rejects(runReply("A second draft.", ctxFor(emailRef)), /paused/);
});

test("fails loudly when the reply request fails for another reason", async () => {
  const { fetch } = recordingFetch(() => Response.json({ _tag: "InternalError" }, { status: 500 }));
  vi.stubGlobal("fetch", fetch);

  await assert.rejects(runReply("It ships today.", ctxFor(emailRef)));
});

test("refuses to run in a session the samva channel did not start", async () => {
  const { requests, fetch } = recordingFetch();
  vi.stubGlobal("fetch", fetch);

  await assert.rejects(runReply("Hello", ctxFor({})), /no message/);
  assert.equal(requests.length, 0);
});

test("the reply tool's input has only a text field", () => {
  const schema = replyToCustomer.inputSchema as { shape?: Record<string, unknown> };
  assert.deepEqual(Object.keys(schema.shape ?? {}), ["text"]);
});

test("one action per message: a reply and a leave in the same step submit one reply", async () => {
  const { requests, fetch } = recordingFetch();
  vi.stubGlobal("fetch", fetch);
  const ctx = ctxFor(emailRef);

  const [reply, leave, second] = await Promise.all([
    runReply("It ships today.", ctx),
    leaveForPerson.execute({ reason: "Asks for a refund." }, ctx),
    runReply("It ships tomorrow.", ctx),
  ]);

  assert.deepEqual(reply, { state: "approvalRequired", actionId: "mbxact_01" });
  assert.deepEqual(leave, { left: false, reason: "This message was already acted on." });
  assert.deepEqual(second, { state: "alreadyActed" });
  assert.equal(requests.length, 1);
});
