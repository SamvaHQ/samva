import { generateWebhookSecret, signWebhook } from "@samva/webhooks";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const secret = generateWebhookSecret();
const mailboxId = "mbx_0000000000000000";
const held = {
  state: "approvalRequired",
  actionId: "action_1",
  messageId: null,
  threadId: null,
  acceptedAt: null,
  draftId: null,
  executeUntil: null,
  retryAt: null,
  problem: null,
  retryEligible: false,
  decision: null,
  waitReason: null,
  reviewExpectedAt: null,
  skippedRecipients: [],
  createdAt: "2026-01-01T12:00:00.000Z",
  updatedAt: "2026-01-01T12:00:00.000Z",
};

async function delivery(key = secret) {
  const occurredAt = new Date().toISOString();
  const body = JSON.stringify({
    type: "mailbox.message.received",
    timestamp: occurredAt,
    data: {
      mailboxId,
      namespaceId: null,
      thread: { id: "thread_0000000000000000", subject: null, preview: null },
      message: {
        id: "msg_0000000000000000",
        channel: "whatsapp",
        threadId: "thread_0000000000000000",
        from: { address: "+15555550100" },
        to: [],
        cc: [],
        subject: null,
        text: "Hello",
        replyText: null,
        attachments: [],
        occurredAt,
      },
    },
  });
  const id = "evt_1";
  const timestamp = String(Math.floor(Date.now() / 1000));
  return new Request("https://example.com/api/samva", {
    method: "POST",
    body,
    headers: {
      "webhook-id": id,
      "webhook-timestamp": timestamp,
      "webhook-signature": await signWebhook({ body, id, timestamp, secret: key }),
    },
  });
}

beforeEach(() => {
  vi.stubEnv("SAMVA_API_KEY", "samva_sk_test_x");
  vi.stubEnv("SAMVA_MAILBOX_ID", mailboxId);
  vi.stubEnv("SAMVA_WEBHOOK_SECRET", secret);
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("fails at startup, naming the variable, when configuration is missing", async () => {
  vi.stubEnv("SAMVA_MAILBOX_ID", "");
  await expect(import("../app/api/samva/route")).rejects.toThrow(/SAMVA_MAILBOX_ID/);
});

it("rejects a delivery with a bad signature without replying", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const { POST } = await import("../app/api/samva/route");
  expect((await POST(await delivery(generateWebhookSecret()))).status).toBe(401);
  expect(fetch).not.toHaveBeenCalled();
});

it("answers a signed delivery with 204 and logs the held reply", async () => {
  const fetch = vi.fn(async (request: Request) => {
    expect(new URL(request.url).pathname).toBe(
      `/v1/mailboxes/${mailboxId}/messages/msg_0000000000000000/reply`,
    );
    expect(await request.json()).toMatchObject({ text: "Thanks for your message." });
    return Response.json(held, { status: 202 });
  });
  vi.stubGlobal("fetch", fetch);
  const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
  const { POST } = await import("../app/api/samva/route");

  expect((await POST(await delivery())).status).toBe(204);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(info).toHaveBeenCalledWith("Reply held for approval", "action_1");
});
