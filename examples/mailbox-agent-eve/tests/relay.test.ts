import { strict as assert } from "node:assert";

import { MailboxEventStreamError } from "samva";
import type { MailboxEvent, SamvaClient } from "samva";
import { test } from "vitest";

import { handleEvent, httpForward, runRelay } from "../src/relay";
import type { CursorStore, Forward } from "../src/relay";
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

test("an aborted signal cancels an in-flight forward", async () => {
  const forward = httpForward(
    "http://eve.test",
    "secret",
    (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      }),
  );
  const controller = new AbortController();

  const pending = forward({ eventId: "evt_1", message: recordingBody() }, controller.signal);
  controller.abort(new Error("shutdown"));

  await assert.rejects(pending, /shutdown/);
});

const recordingStore = (initial?: string) => {
  const calls: string[] = [];
  let cursor = initial;
  const store: CursorStore = {
    load: async () => cursor,
    save: async (next) => {
      calls.push(`save:${next}`);
      cursor = next;
    },
    clear: async () => {
      calls.push("clear");
      cursor = undefined;
    },
  };
  return { calls, store };
};

type StreamScript = (cursor: string | undefined) => AsyncGenerator<MailboxEvent>;

/** A client whose event stream is scripted per connection; records the cursor of each. */
const fakeClient = (scripts: StreamScript[]) => {
  const cursors: (string | undefined)[] = [];
  const samva = {
    mailboxes: {
      events: (options: { cursor?: string }) => {
        cursors.push(options.cursor);
        const script = scripts[cursors.length - 1];
        if (script === undefined) throw new Error("unexpected extra connection");
        return script(options.cursor);
      },
    },
  } as unknown as SamvaClient;
  return { cursors, samva };
};

const expired = () =>
  new MailboxEventStreamError({ _tag: "CursorExpiredError", message: "Events are gone." });

test("resumes from the saved cursor", async () => {
  const { store } = recordingStore("cursor-0");
  const { cursors, samva } = fakeClient([
    async function* () {
      yield* [];
    },
  ]);

  await runRelay(samva, { mailboxId: "mbx_01", forward: async () => {}, store, log: () => {} });

  assert.deepEqual(cursors, ["cursor-0"]);
});

test("saves the cursor after a successful forward", async () => {
  const { bodies, forward } = recording();
  const { calls, store } = recordingStore();
  const { samva } = fakeClient([
    async function* () {
      yield received();
    },
  ]);

  await runRelay(samva, { mailboxId: "mbx_01", forward, store, log: () => {} });

  assert.equal(bodies.length, 1);
  assert.deepEqual(calls, ["save:cursor-1"]);
});

test("does not save the cursor when the forward fails", async () => {
  const { calls, store } = recordingStore("cursor-0");
  const { samva } = fakeClient([
    async function* () {
      yield received();
    },
  ]);
  const forward: Forward = async () => {
    throw new Error("Eve is down");
  };

  await assert.rejects(
    runRelay(samva, { mailboxId: "mbx_01", forward, store, log: () => {} }),
    /Eve is down/,
  );

  assert.deepEqual(calls, []);
});

test("clears the cursor and reconnects live after CursorExpiredError", async () => {
  const { bodies, forward } = recording();
  const { calls, store } = recordingStore("stale");
  const { cursors, samva } = fakeClient([
    async function* () {
      yield* [];
      throw expired();
    },
    async function* () {
      yield received();
    },
  ]);

  await runRelay(samva, { mailboxId: "mbx_01", forward, store, log: () => {} });

  assert.deepEqual(cursors, ["stale", undefined]);
  assert.deepEqual(calls, ["clear", "save:cursor-1"]);
  assert.equal(bodies.length, 1);
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
