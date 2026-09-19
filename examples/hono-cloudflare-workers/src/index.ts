import { Hono } from "hono";
import { createClient, SamvaApiError, SamvaTransportError } from "samva";
import { verifyRequest, WebhookVerificationError } from "samva/webhooks";

type Bindings = {
  SAMVA_API_KEY: string;
  SAMVA_WEBHOOK_SECRET: string;
};

type SendRequestBody = {
  to?: unknown;
  subject?: unknown;
  html?: unknown;
  text?: unknown;
};

const app = new Hono<{ Bindings: Bindings }>();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

app.get("/", (c) => c.text("samva + hono on workers"));

app.post("/send", async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  if (!isRecord(body)) {
    return c.json({ error: "Expected a JSON object." }, 400);
  }

  const { to, subject, html, text } = body as SendRequestBody;
  const recipientEmail = readString(to);
  const emailSubject = readString(subject);

  if (!recipientEmail || !emailSubject) {
    return c.json({ error: "to and subject are required" }, 400);
  }

  const apiKey = c.env.SAMVA_API_KEY;
  if (!apiKey) {
    throw new Error("SAMVA_API_KEY is not configured for this Worker.");
  }

  const samva = createClient({ apiKey });
  try {
    const message = await samva.messages.send({
      to: [{ email: recipientEmail }],
      channel: "email",
      email: {
        subject: emailSubject,
        html: readString(html) || "<p>Hello from Hono on Cloudflare Workers.</p>",
        text: readString(text) || undefined,
      },
    });

    return c.json({ ok: true, id: message.id });
  } catch (error) {
    if (!(error instanceof SamvaApiError) && !(error instanceof SamvaTransportError)) throw error;

    return c.json({ ok: false, error: error.message }, 502);
  }
});

app.post("/webhooks/samva", async (c) => {
  const secret = c.env.SAMVA_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("SAMVA_WEBHOOK_SECRET is not configured for this Worker.");
  }

  // Verify the untouched raw request before trusting any event data.
  try {
    const verified = await verifyRequest(c.req.raw, secret);
    return c.json({ ok: true, id: verified.id, type: verified.event.type }, 202);
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      return c.json({ ok: false, error: "Invalid webhook signature." }, 400);
    }
    throw error;
  }
});

export default app;
