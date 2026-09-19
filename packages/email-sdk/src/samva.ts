import { EmailAdapterError, EmailValidationError } from "@opencoredev/email-sdk";
import type { EmailAdapter, EmailAdapterCapabilities, EmailPlugin } from "@opencoredev/email-sdk";
import { createClient } from "samva";
import type { SamvaClient } from "samva";

import { isAbortFailure, toEmailAdapterError } from "./failures";
import { toSamvaMessage, validateMessage } from "./message";

/** Factory options for the provider-owned Samva community adapter. */
export type SamvaAdapterOptions = {
  /** Samva API key. Required unless `client` is injected. */
  readonly apiKey?: string;
  /** Override the Samva API origin. */
  readonly baseUrl?: string;
  /** Fetch implementation used by the Samva client. */
  readonly fetch?: typeof fetch;
  /** Headers added to every Samva request. */
  readonly headers?: HeadersInit;
  /** Preconfigured client, primarily for dependency injection and tests. */
  readonly client?: SamvaClient;
};

/** Raw Samva Promise-client result returned from `email.send`. */
export type SamvaSendResult = Awaited<ReturnType<SamvaClient["email"]["send"]>>;

/** The literal Email SDK adapter type returned by {@link samva}. */
export type SamvaEmailAdapter = EmailAdapter<"samva", SamvaClient, SamvaSendResult>;

const capabilities = {
  repeatedHeaders: false,
  idempotency: "native",
  scheduling: false,
  personalized: "expanded",
} as const satisfies EmailAdapterCapabilities;

function configuredClient(options: SamvaAdapterOptions): SamvaClient {
  if (options.client) return options.client;
  if (!options.apiKey) {
    throw new EmailValidationError(
      "The Samva Email SDK adapter requires an apiKey unless a client is injected.",
    );
  }
  return createClient({
    apiKey: options.apiKey,
    ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    ...(options.headers === undefined ? {} : { headers: options.headers }),
  });
}

function abortReason(signal: AbortSignal | undefined): unknown {
  if (signal?.reason instanceof Error) return signal.reason;
  return new DOMException("Email sending was aborted.", "AbortError");
}

/** Create an Email SDK adapter backed by the Samva Promise client. */
export function samva(options: SamvaAdapterOptions): SamvaEmailAdapter {
  const client = configuredClient(options);

  return {
    name: "samva",
    capabilities,
    raw: client,
    validate(message) {
      validateMessage(message);
    },
    async send(message, context) {
      if (context.signal?.aborted) throw abortReason(context.signal);

      const payload = await toSamvaMessage(message);
      const headers =
        context.idempotencyKey === undefined
          ? undefined
          : { "idempotency-key": context.idempotencyKey };
      let result: SamvaSendResult;
      try {
        result = await client.email.send(payload, {
          ...(context.signal === undefined ? {} : { signal: context.signal }),
          ...(headers === undefined ? {} : { headers }),
        });
      } catch (error) {
        if (isAbortFailure(error, context.signal)) throw abortReason(context.signal);
        throw toEmailAdapterError(error);
      }

      if (!result || typeof result !== "object" || typeof result.id !== "string") {
        throw new EmailAdapterError("Samva returned a malformed email send response.", {
          adapter: "samva",
          delivery: "unknown",
        });
      }

      return { adapter: "samva", id: result.id, raw: result };
    },
  };
}

/** Register a single Samva adapter through Email SDK's plugin interface. */
export function samvaPlugin(options: SamvaAdapterOptions): EmailPlugin {
  return {
    id: "samva",
    adapters: [samva(options)],
  };
}
