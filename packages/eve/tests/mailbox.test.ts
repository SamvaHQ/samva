import type { StateHandle } from "eve/context";
import type { ToolContext } from "eve/tools";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import extension from "../extension/extension";
import { mailboxTools } from "../extension/tools/mailbox";

const { slots } = vi.hoisted(() => ({ slots: new Map<string, () => void>() }));

// Supply the session state slot without booting a workflow or remote model.
vi.mock("eve/context", () => ({
  defineState<T>(name: string, initial: () => T): StateHandle<T> {
    let current: T;
    slots.set(name, () => {
      current = initial();
    });
    current = initial();
    return {
      get: () => current,
      update: (update) => {
        current = update(current);
      },
    };
  },
}));

const ref = { eventId: "evt_1", mailboxId: "mbx_1", messageId: "msg_1", channel: "whatsapp" };
function noRuntime(): never {
  throw new Error("Unused Eve test context method");
}
const ctx: ToolContext = {
  callId: "call_1",
  toolName: "samva__reply_to_customer",
  abortSignal: new AbortController().signal,
  messages: [],
  channel: { kind: "channel:samva__samva", metadata: { adapterName: "samva" } },
  session: {
    id: "session_1",
    auth: {
      initiator: null,
      current: {
        authenticator: "samva-webhook",
        principalId: "thread_1",
        principalType: "customer",
        attributes: ref,
      },
    },
    turn: { id: "turn_1", sequence: 1 },
  },
  getSandbox: noRuntime,
  getToken: noRuntime,
  requireAuth: noRuntime,
  to: noRuntime,
};

function tools() {
  const result = mailboxTools(ctx);
  if (!result) throw new Error("Expected tools for the verified inbound event");
  return result;
}

const receipt = {
  actionId: "action_1",
  state: "approvalRequired",
  messageId: null,
  threadId: null,
};

beforeEach(() => {
  extension({ apiKey: "test", mailboxId: ref.mailboxId });
  for (const reset of slots.values()) reset();
});

afterEach(() => vi.unstubAllGlobals());

it("mounts tools for the verified inbound event and filters a different mailbox", () => {
  expect(tools()).toHaveProperty("reply_to_customer");
  extension({ apiKey: "test", mailboxId: "mbx_2" });
  expect(mailboxTools(ctx)).toBeNull();
  expect(mailboxTools({ channel: ctx.channel, session: { auth: { current: null } } })).toBeNull();
});

it("saves the action claim across catalog rebuilds", async () => {
  const fetch = vi.fn(async (req: Request) => {
    expect(new URL(req.url).pathname).toBe("/v1/mailboxes/mbx_1/messages/msg_1/reply");
    expect(req.headers.get("idempotency-key")).toBe("reply:evt_1");
    expect(await req.json()).toEqual({ text: "Hello", channel: "whatsapp" });
    return Response.json(receipt, { status: 202 });
  });
  vi.stubGlobal("fetch", fetch);
  const reply = tools().reply_to_customer.execute({ text: "Hello" }, ctx);
  expect(await tools().leave_for_person.execute({ reason: "Escalate" }, ctx)).toEqual({
    status: "already handled",
  });
  await expect(reply).resolves.toEqual({ status: "held for approval", receipt });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("allows a same-key retry after a lost reply without allowing handoff", async () => {
  const fetch = vi
    .fn<(req: Request) => Promise<Response>>()
    .mockRejectedValueOnce(new Error("Lost response"))
    .mockResolvedValueOnce(Response.json(receipt, { status: 202 }));
  vi.stubGlobal("fetch", fetch);

  await expect(tools().reply_to_customer.execute({ text: "Hello" }, ctx)).rejects.toThrow();
  expect(await tools().leave_for_person.execute({ reason: "Escalate" }, ctx)).toEqual({
    status: "reply outcome unknown",
  });
  await expect(tools().reply_to_customer.execute({ text: "Hello again" }, ctx)).resolves.toEqual({
    status: "held for approval",
    receipt,
  });
  expect(fetch.mock.calls.map(([req]) => req.headers.get("idempotency-key"))).toEqual([
    "reply:evt_1",
    "reply:evt_1",
  ]);
});
