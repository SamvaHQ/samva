import { createHash, timingSafeEqual } from "node:crypto";

import { parseRelayBody, userTurn } from "./message";
import type { MessageRef } from "./message";

/** The one session operation intake needs, as `from(address).send` in the channel route. */
export type SendToSession = (
  address: string,
  message: string,
  options: {
    readonly auth: null;
    readonly idempotencyKey: string;
    readonly state: MessageRef;
  },
) => Promise<unknown>;

const digest = (value: string) => createHash("sha256").update(value).digest();

const bearerMatches = (request: Request, token: string): boolean => {
  const header = request.headers.get("authorization") ?? "";
  return timingSafeEqual(digest(header), digest(`Bearer ${token}`));
};

/**
 * Accept one message from the relay and start one agent run for it. The event id names the
 * session and keys the send, so a redelivered event reaches the same run and is ignored.
 */
export const acceptMessage = async (
  request: Request,
  token: string,
  send: SendToSession,
): Promise<Response> => {
  if (!bearerMatches(request, token)) return new Response("unauthorized", { status: 401 });
  const body = parseRelayBody(await request.json().catch(() => undefined));
  if (body === undefined) return Response.json({ error: "invalid body" }, { status: 400 });

  const key = `samva:${body.eventId}`;
  const delivery = await send(key, userTurn(body.message), {
    auth: null,
    idempotencyKey: key,
    state: {
      eventId: body.eventId,
      mailboxId: body.message.mailboxId,
      messageId: body.message.messageId,
      channel: body.message.channel,
    },
  });
  return Response.json(delivery, { status: 202 });
};
