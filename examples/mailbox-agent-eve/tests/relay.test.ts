import { strict as assert } from "node:assert";

import { test } from "vitest";

import { handleEvent, httpForward } from "../src/relay";
import type { Forward } from "../src/relay";
import { received } from "./support";

const recording = () => {
  const bodies: Parameters<Forward>[0][] = [];
  const forward: Forward = async (body) => {
    bodies.push(body);
  };
  return { bodies, forward };
};

test("forwards a received email with the event id", async () => {
  const { bodies, forward } = recording();

  await handleEvent(received(), forward, () => {});

  assert.deepEqual(bodies, [
    {
      eventId: "evt_1",
      message: {
        mailboxId: "mbx_01",
        messageId: "msg_1",
        channel: "email",
        fromAddress: "ada@example.com",
        subject: "Where is my order?",
        text: "Order 1042 has not arrived.",
      },
    },
  ]);
});

test("forwards a WhatsApp message with its channel", async () => {
  const { bodies, forward } = recording();

  await handleEvent(
    received({ channel: "whatsapp", from: { address: "+16175559876" }, subject: null }),
    forward,
    () => {},
  );

  assert.equal(bodies[0]?.message.channel, "whatsapp");
});

test("never forwards an automated sender", async () => {
  const { bodies, forward } = recording();

  await handleEvent(received({ from: { address: "no-reply@example.com" } }), forward, () => {});

  assert.equal(bodies.length, 0);
});

test("ignores other event types and fails on a malformed received event", async () => {
  const { bodies, forward } = recording();

  await handleEvent({ ...received(), type: "mailbox.message.sent" } as never, forward, () => {});
  assert.equal(bodies.length, 0);

  await assert.rejects(
    handleEvent({ ...received(), data: {} }, forward, () => {}),
    /Malformed/,
  );
});

test("posts to the channel route with the relay token", async () => {
  const requests: Request[] = [];
  const forward = httpForward("http://eve.test", "secret", async (input, init) => {
    requests.push(new Request(input, init));
    return new Response(null, { status: 202 });
  });

  await forward({ eventId: "evt_1", message: recordingBody() });

  assert.equal(requests[0]!.url, "http://eve.test/samva/messages");
  assert.equal(requests[0]!.headers.get("authorization"), "Bearer secret");
});

test("throws when Eve does not accept the event, so it is retried", async () => {
  const forward = httpForward(
    "http://eve.test",
    "secret",
    async () => new Response("no", { status: 500 }),
  );

  await assert.rejects(forward({ eventId: "evt_1", message: recordingBody() }), /HTTP 500/);
});

function recordingBody() {
  return {
    mailboxId: "mbx_01",
    messageId: "msg_1",
    channel: "email" as const,
    fromAddress: "ada@example.com",
    subject: null,
    text: "Hi",
  };
}
