import {
  createEmailClient,
  EmailAbortError,
  EmailAdapterError,
  EmailValidationError,
} from "@opencoredev/email-sdk";
import type { EmailAdapterContext, EmailMessage } from "@opencoredev/email-sdk";
import {
  EmailChannelError,
  InternalError,
  RateLimitedError,
  SamvaTransportError,
  ValidationError,
} from "samva";
import type { SamvaClient } from "samva";
import { describe, expect, it, vi } from "vitest";

import { samva, samvaPlugin } from "../src";

const message: EmailMessage = {
  from: "Samva <hello@samva.dev>",
  to: ["Ada <ada@example.com>", { email: "linus@example.com", name: "Linus" }],
  cc: "cc@example.com",
  bcc: { email: "bcc@example.com" },
  replyTo: ["reply@example.com", { email: "help@example.com" }],
  subject: "Welcome",
  html: "<p>Hello</p>",
  text: "Hello",
  metadata: { tenant: "arya", attempt: 2, active: true, empty: null },
  attachments: [{ filename: "hello.txt", content: "hello", contentType: "text/plain" }],
};

const context: EmailAdapterContext = {
  adapter: "samva",
  operation: "send",
  attempt: 1,
};

function injectedClient(
  send: (payload: unknown, options?: { signal?: AbortSignal }) => Promise<unknown>,
): SamvaClient {
  return { email: { send } } as unknown as SamvaClient;
}

describe("samva", () => {
  it("declares the exact community adapter capabilities", () => {
    const adapter = samva({ client: injectedClient(async () => ({ id: "message_1" })) });

    expect(adapter.name).toBe("samva");
    expect(adapter.capabilities).toEqual({
      repeatedHeaders: false,
      idempotency: "native",
      scheduling: false,
      personalized: "expanded",
    });
    expect(adapter.sendPersonalized).toBeUndefined();
  });

  it("maps supported fields exactly and normalizes the result", async () => {
    const raw = { id: "message_1", status: "queued", recipients: [{ status: "queued" }] };
    const send = vi.fn(async (_payload: unknown, _options?: { signal?: AbortSignal }) => raw);
    const adapter = samva({ client: injectedClient(send) });

    await expect(adapter.send(message, context)).resolves.toEqual({
      adapter: "samva",
      id: "message_1",
      raw,
    });
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]![0]).toEqual({
      from: { email: "hello@samva.dev", name: "Samva" },
      to: [
        { email: "ada@example.com", name: "Ada" },
        { email: "linus@example.com", name: "Linus" },
      ],
      cc: [{ email: "cc@example.com" }],
      bcc: [{ email: "bcc@example.com" }],
      replyTo: ["reply@example.com", "help@example.com"],
      subject: "Welcome",
      html: "<p>Hello</p>",
      text: "Hello",
      metadata: { tenant: "arya", attempt: 2, active: true, empty: null },
      attachments: [
        {
          filename: "hello.txt",
          content: "aGVsbG8=",
          contentType: "text/plain",
          size: 5,
        },
      ],
    });
  });

  it.each([
    ["raw string", "hello", undefined, "aGVsbG8=", 5],
    ["base64 string", "aGVsbG8=", "base64", "aGVsbG8=", 5],
    ["Uint8Array", new Uint8Array([0, 255, 1]), undefined, "AP8B", 3],
    ["ArrayBuffer", new Uint8Array([0, 255, 1]).buffer, undefined, "AP8B", 3],
    ["Blob", new Blob([new Uint8Array([0, 255, 1])]), undefined, "AP8B", 3],
  ] as const)(
    "converts %s attachments to base64 with byte size",
    async (_name, content, contentEncoding, expectedContent, expectedSize) => {
      const send = vi.fn(async (_payload: unknown) => ({ id: "message_1" }));
      const adapter = samva({ client: injectedClient(send) });

      await adapter.send(
        {
          ...message,
          attachments: [
            {
              filename: "bytes.bin",
              content,
              contentType: "application/octet-stream",
              ...(contentEncoding === undefined ? {} : { contentEncoding }),
            },
          ],
        },
        context,
      );

      expect(send.mock.calls[0]![0]).toMatchObject({
        attachments: [
          {
            filename: "bytes.bin",
            content: expectedContent,
            contentType: "application/octet-stream",
            size: expectedSize,
          },
        ],
      });
    },
  );

  it("rejects malformed base64 attachment content before calling Samva", async () => {
    const send = vi.fn(async (_payload: unknown) => ({ id: "message_1" }));
    const adapter = samva({ client: injectedClient(send) });

    await expect(
      adapter.send(
        {
          ...message,
          attachments: [
            {
              filename: "bad.bin",
              content: "not base64",
              contentEncoding: "base64",
              contentType: "application/octet-stream",
            },
          ],
        },
        context,
      ),
    ).rejects.toBeInstanceOf(EmailValidationError);
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    ["missing at sign", "invalid.example.com"],
    ["multiple bare addresses", "a@example.com, b@example.com"],
    ["trailing display text", "Ada <ada@example.com> trailing"],
    ["empty display address", "Ada <>"],
    ["surrounding whitespace", " ada@example.com"],
    ["object whitespace", { email: "ada@example.com " }],
    ["object newline name", { email: "ada@example.com", name: "Ada\nInjected" }],
  ])("rejects malformed or ambiguous %s addresses", async (_name, to) => {
    const send = vi.fn(async (_payload: unknown) => ({ id: "message_1" }));
    const adapter = samva({ client: injectedClient(send) });

    await expect(adapter.send({ ...message, to } as EmailMessage, context)).rejects.toBeInstanceOf(
      EmailValidationError,
    );
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    ["headers", { headers: [{ name: "X-Test", value: "yes" }] }],
    [
      "repeated headers",
      {
        headers: [
          { name: "X-Test", value: "one" },
          { name: "x-test", value: "two" },
        ],
      },
    ],
    ["tags", { tags: [{ name: "kind", value: "welcome" }] }],
    ["sendAt", { sendAt: new Date("2026-08-18T00:00:00Z") }],
    ["path", { attachments: [{ filename: "x", path: "/tmp/x", contentType: "text/plain" }] }],
    [
      "contentId",
      {
        attachments: [{ filename: "x", content: "x", contentType: "text/plain", contentId: "cid" }],
      },
    ],
    [
      "disposition",
      {
        attachments: [
          { filename: "x", content: "x", contentType: "text/plain", disposition: "inline" },
        ],
      },
    ],
    ["contentType", { attachments: [{ filename: "x", content: "x" }] }],
    ["replyTo", { replyTo: "Support <support@example.com>" }],
    ["to", { to: "Ada <broken>" }],
  ])("rejects unsupported or lossy %s before calling Samva", async (_field, update) => {
    const send = vi.fn(async (_payload: unknown, _options?: { signal?: AbortSignal }) => ({
      id: "message_1",
    }));
    const adapter = samva({ client: injectedClient(send) });

    await expect(
      adapter.send({ ...message, ...update } as EmailMessage, context),
    ).rejects.toBeInstanceOf(EmailValidationError);
    expect(send).not.toHaveBeenCalled();
  });

  it("forwards an idempotency key as the Samva Idempotency-Key header", async () => {
    const send = vi.fn(
      async (
        _payload: unknown,
        _options?: { signal?: AbortSignal; headers?: Record<string, string> },
      ) => ({ id: "message_1" }),
    );
    const adapter = samva({ client: injectedClient(send) });

    await adapter.send(message, { ...context, idempotencyKey: "dedupe" });

    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]![1]).toMatchObject({
      headers: { "idempotency-key": "dedupe" },
    });
  });

  it("forwards the AbortSignal and preserves Email SDK abort semantics", async () => {
    const controller = new AbortController();
    const send = vi.fn(async (_payload: unknown, options?: { signal?: AbortSignal }) => {
      await new Promise<void>((_resolve, reject) => {
        options?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("aborted", "AbortError")),
          { once: true },
        );
      });
      return { id: "unreachable" };
    });
    const client = createEmailClient({
      adapters: [samva({ client: injectedClient(send) })],
      telemetry: false,
    });

    const sending = client.send(message, { signal: controller.signal });
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
    controller.abort("stop");
    await expect(sending).rejects.toBeInstanceOf(EmailAbortError);
    expect(send.mock.calls[0]![1]?.signal).toBe(controller.signal);
  });

  it("rejects a pre-aborted Email SDK send without calling Samva", async () => {
    const controller = new AbortController();
    controller.abort("stop");
    const send = vi.fn(async (_payload: unknown) => ({ id: "message_1" }));
    const client = createEmailClient({
      adapters: [samva({ client: injectedClient(send) })],
      telemetry: false,
    });

    await expect(client.send(message, { signal: controller.signal })).rejects.toBeInstanceOf(
      EmailAbortError,
    );
    expect(send).not.toHaveBeenCalled();
  });

  it("configures the Samva client with base URL, fetch, headers, and signal", async () => {
    let request: Request | undefined;
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      request = input as Request;
      return new Response(JSON.stringify({ id: "message_http" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    });
    const controller = new AbortController();
    const adapter = samva({
      apiKey: "samva_sk_test_example",
      baseUrl: "https://samva.test",
      fetch: fetcher as unknown as typeof fetch,
      headers: { "x-adapter-test": "yes" },
    });

    await expect(
      adapter.send(message, { ...context, signal: controller.signal }),
    ).resolves.toMatchObject({ adapter: "samva", id: "message_http" });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(request && new URL(request.url).origin).toBe("https://samva.test");
    expect(request?.headers.get("x-api-key")).toBe("samva_sk_test_example");
    expect(request?.headers.get("x-adapter-test")).toBe("yes");
    controller.abort("stop");
    expect(request?.signal.aborted).toBe(true);
  });

  it.each([
    [
      "rate limit",
      new RateLimitedError(
        { operation: "messages.send", retryAfterSeconds: 10 },
        {
          response: new Response(null, {
            status: 429,
            headers: { "x-request-id": "request_rate" },
          }),
        },
      ),
      { status: 429, requestId: "request_rate", retryable: true, delivery: "not_sent" },
    ],
    [
      "validation",
      new ValidationError(
        { operation: "messages.send", message: "invalid", fields: null },
        {
          response: new Response(null, {
            status: 422,
            headers: { "x-request-id": "request_validation" },
          }),
        },
      ),
      {
        status: 422,
        requestId: "request_validation",
        retryable: false,
        delivery: "not_sent",
      },
    ],
    [
      "provider transport",
      new EmailChannelError(
        {
          operation: "messages.send",
          message: "provider timeout",
          reason: "transport",
          statusCode: 503,
        },
        {
          response: new Response(null, {
            status: 502,
            headers: { "x-request-id": "request_transport" },
          }),
        },
      ),
      {
        status: 503,
        requestId: "request_transport",
        retryable: true,
        delivery: "unknown",
      },
    ],
    [
      "ambiguous server",
      new InternalError(
        { operation: "messages.send", message: "server failed" },
        {
          response: new Response(null, {
            status: 500,
            headers: { "x-request-id": "request_server" },
          }),
        },
      ),
      { status: 500, requestId: "request_server", retryable: true, delivery: "unknown" },
    ],
    [
      "malformed response",
      new SamvaTransportError(
        { secret: "provider body" },
        {
          response: new Response(null, {
            status: 502,
            headers: { "x-request-id": "request_malformed" },
          }),
        },
      ),
      {
        status: 502,
        requestId: "request_malformed",
        retryable: true,
        delivery: "unknown",
      },
    ],
    [
      "onboarding review",
      {
        _tag: "OnboardingReviewRequiredError",
        statusCode: 403,
        response: new Response(null, {
          status: 403,
          headers: { "x-request-id": "request_review" },
        }),
      },
      {
        status: 403,
        requestId: "request_review",
        retryable: false,
        delivery: "not_sent",
      },
    ],
  ] as const)("maps %s failures safely", async (_name, failure, expected) => {
    const adapter = samva({
      client: injectedClient(async () => {
        throw failure;
      }),
    });

    const error = await Promise.resolve(adapter.send(message, context)).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(EmailAdapterError);
    expect(error).toMatchObject({
      adapter: "samva",
      message: "Samva email send failed.",
      ...expected,
    });
    expect((error as Error).cause).toBeUndefined();
    expect(String(error)).not.toContain("provider body");
  });

  it.each([
    { status: 408, retryable: true },
    { status: 409, retryable: false },
    { status: 425, retryable: true },
  ] as const)(
    "maps transport status $status to retryable=$retryable with unknown delivery",
    async ({ status, retryable }) => {
      const adapter = samva({
        client: injectedClient(async () => {
          throw {
            _tag: "SamvaTransportError",
            status,
            response: new Response(null, {
              status,
              headers: { "x-request-id": `request_${status}` },
            }),
          };
        }),
      });

      const error = await Promise.resolve(adapter.send(message, context)).catch(
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(EmailAdapterError);
      expect(error).toMatchObject({
        adapter: "samva",
        status,
        requestId: `request_${status}`,
        retryable,
        delivery: "unknown",
      });
    },
  );

  it("classifies malformed success as unknown delivery", async () => {
    const adapter = samva({ client: injectedClient(async () => ({ status: "queued" })) });

    const error = await Promise.resolve(adapter.send(message, context)).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(EmailAdapterError);
    expect(error).toMatchObject({
      adapter: "samva",
      retryable: false,
      delivery: "unknown",
      message: "Samva returned a malformed email send response.",
    });
  });

  it("expands personalized sends into one Samva call per recipient", async () => {
    const send = vi.fn(async (payload: unknown) => ({
      id: `message_${send.mock.calls.length}`,
      payload,
    }));
    const client = createEmailClient({
      adapters: [samva({ client: injectedClient(send) })],
      telemetry: false,
    });

    await expect(
      client.sendPersonalized({
        message: {
          from: "hello@example.com",
          subject: "Welcome, %recipient.name%",
          text: "Account %recipient.id% is ready.",
        },
        recipients: [
          { to: "ada@example.com", variables: { name: "Ada", id: 1 } },
          {
            to: { email: "linus@example.com", name: "Linus" },
            variables: { name: "Linus", id: 2 },
          },
        ],
      }),
    ).resolves.toMatchObject({
      adapter: "samva",
      accepted: ["ada@example.com", "linus@example.com"],
      rejected: [],
    });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls.map(([payload]) => payload)).toMatchObject([
      { to: [{ email: "ada@example.com" }], subject: "Welcome, Ada", text: "Account 1 is ready." },
      {
        to: [{ email: "linus@example.com", name: "Linus" }],
        subject: "Welcome, Linus",
        text: "Account 2 is ready.",
      },
    ]);
  });

  it("normalizes unknown failures conservatively", async () => {
    const adapter = samva({
      client: injectedClient(async () => {
        throw new Error("secret provider body");
      }),
    });

    const error = await Promise.resolve(adapter.send(message, context)).catch(
      (failure: unknown) => failure,
    );
    expect(error).toBeInstanceOf(EmailAdapterError);
    expect(error).toMatchObject({
      adapter: "samva",
      retryable: false,
      delivery: "unknown",
      message: "Samva email send failed.",
    });
    expect(String(error)).not.toContain("secret provider body");
  });

  it("registers one adapter through samvaPlugin and requires credentials otherwise", () => {
    const plugin = samvaPlugin({ client: injectedClient(async () => ({ id: "message_1" })) });
    expect(plugin).toMatchObject({ id: "samva" });
    expect(plugin.adapters).toHaveLength(1);
    expect(Array.isArray(plugin.adapters) && plugin.adapters[0]?.name).toBe("samva");
    const client = createEmailClient({ plugins: [plugin], telemetry: false });
    expect(client.defaultAdapter).toBe("samva");
    expect(() => samva({})).toThrow(EmailValidationError);
  });
});
