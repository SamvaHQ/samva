import { SAMVA_SEND_TOKEN } from "$app/env/private";
import { error, json } from "@sveltejs/kit";

import { buildContactEmail } from "#lib/contact-email";
import { getSamva } from "#lib/server/samva";

import type { RequestHandler } from "./$types";

interface SendRequestBody {
  readonly name?: unknown;
  readonly to?: unknown;
  readonly subject?: unknown;
  readonly message?: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const isEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export const POST: RequestHandler = async ({ request }) => {
  const sendToken = SAMVA_SEND_TOKEN;
  if (!sendToken) {
    error(500, "SAMVA_SEND_TOKEN is not configured.");
  }

  if (request.headers.get("authorization") !== `Bearer ${sendToken}`) {
    error(401, "Unauthorized.");
  }

  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body)) {
    error(400, "Expected a JSON object.");
  }

  const { name, to, subject, message } = body as SendRequestBody;
  const recipientEmail = readString(to);
  const emailSubject = readString(subject);
  const text = readString(message);

  if (!isEmail(recipientEmail) || !emailSubject || !text) {
    error(400, "to, subject, and message are required.");
  }

  const senderName = readString(name);
  const contact = {
    email: recipientEmail,
    message: text,
    subject: emailSubject,
    ...(senderName ? { name: senderName } : {}),
  };

  await getSamva().messages.send({
    to: [{ email: recipientEmail }],
    channel: "email",
    email: buildContactEmail(contact),
  });

  return json({ ok: true });
};
