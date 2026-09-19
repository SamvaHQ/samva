// This consumer example validates the SDK's `data: unknown` webhook payload
// without pulling Effect Schema into a sample that installs only `samva`; the
// SDK's portable verifier uses the same closed-boundary rationale.
import type { SamvaClient } from "samva";
import { verifyRequest } from "samva/webhooks";

type InboundReply = {
  readonly messageId: string;
  readonly conversationId: string;
  readonly from: string;
  readonly subject?: string;
  readonly isAutoReply?: boolean;
};

const isInboundReply = (value: unknown): value is InboundReply => {
  if (typeof value !== "object" || value === null) return false;
  const data = value as Record<string, unknown>;
  return (
    ["messageId", "conversationId", "from"].every((field) => typeof data[field] === "string") &&
    (data.subject === undefined || typeof data.subject === "string") &&
    (data.isAutoReply === undefined || typeof data.isAutoReply === "boolean")
  );
};

const ENDPOINT_NAME = "Inbound replies";

export async function configureInboundEmail(
  samva: SamvaClient,
  input: {
    readonly domainId: string;
    readonly domain: string;
    readonly webhookUrl: string;
  },
) {
  // Reuse an endpoint left by a partial run so setup converges instead of
  // colliding with the organization's unique endpoint name. Reconcile its full
  // configuration, because a rerun with a new URL or subscription must not keep
  // delivering inbound mail to a stale receiver.
  const existing = (await samva.webhooks.list()).items.find(
    (endpoint) => endpoint.name === ENDPOINT_NAME,
  );

  const endpoint = existing
    ? {
        endpoint: await samva.webhooks.update({
          id: existing.id,
          url: input.webhookUrl,
          eventTypes: ["message.received"],
          channels: ["email"],
          status: "active",
        }),
        // A signing secret is shown only when the endpoint is created. If a
        // previous setup run lost it, rotate it with `webhooks.regenerateSecret`.
        secret: null,
      }
    : await samva.webhooks.create({
        name: ENDPOINT_NAME,
        url: input.webhookUrl,
        eventTypes: ["message.received"],
        channels: ["email"],
      });

  const receiving = await samva.email.enableReceiving({
    id: input.domainId,
    domain: input.domain,
    catchAll: true,
    endpointId: endpoint.endpoint.id,
  });

  return { endpoint, receiving };
}

export async function handleInboundReply(
  request: Request,
  input: {
    readonly samva: SamvaClient;
    readonly webhookSecret: string;
    readonly processedWebhookIds: Set<string>;
  },
) {
  const verified = await verifyRequest(request, input.webhookSecret);
  if (verified.event.type !== "message.received" || !isInboundReply(verified.event.data)) {
    return { accepted: false, reason: "ignored" } as const;
  }

  // An out-of-office or otherwise automatic response must not trigger another reply.
  if (verified.event.data.isAutoReply) {
    return { accepted: false, reason: "auto-reply" } as const;
  }

  // Record completion only after the reply is sent. The send carries the event
  // id as an idempotency key, so a concurrent retry cannot double-send while a
  // transient failure can still be retried.
  // Persist this set under a unique constraint in production.
  if (input.processedWebhookIds.has(verified.id)) {
    return { accepted: false, reason: "duplicate" } as const;
  }

  const reply = verified.event.data;
  const [conversation, messages] = await Promise.all([
    input.samva.conversations.getById({ id: reply.conversationId }),
    input.samva.conversations.listMessages({ id: reply.conversationId }),
  ]);

  const sent = await input.samva.email.send(
    {
      conversationId: reply.conversationId,
      to: reply.from,
      subject: reply.subject ? `Re: ${reply.subject}` : "Re: your message",
      html: "<p>Thanks for your reply. We will follow up shortly.</p>",
      inReplyToMessageId: reply.messageId,
    },
    { headers: { "idempotency-key": verified.id } },
  );

  input.processedWebhookIds.add(verified.id);

  return { accepted: true, conversation, messages, sent } as const;
}
