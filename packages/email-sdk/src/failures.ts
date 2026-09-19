import { EmailAdapterError } from "@opencoredev/email-sdk";

type ErrorRecord = Record<string, unknown>;

const knownNotSentTags = new Set([
  "ConflictError",
  "EmailChannelError",
  "FlagDisabledError",
  "ForbiddenError",
  "OnboardingReviewRequiredError",
  "PaymentRequiredError",
  "RateLimitedError",
  "ResourceNotFoundError",
  "UnauthorizedError",
  "ValidationError",
]);

function isRecord(value: unknown): value is ErrorRecord {
  return typeof value === "object" && value !== null;
}

function numericField(error: ErrorRecord, key: string): number | undefined {
  const value = error[key];
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function statusOf(error: ErrorRecord): number | undefined {
  return numericField(error, "statusCode") ?? numericField(error, "status");
}

function requestIdOf(error: ErrorRecord): string | undefined {
  const direct = error.requestId;
  if (typeof direct === "string" && direct.length > 0) return direct;
  const response = error.response;
  if (!isRecord(response)) return undefined;
  const headers = response.headers;
  if (!isRecord(headers) || typeof headers.get !== "function") return undefined;
  const value = headers.get("x-request-id");
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isRetryableStatus(status: number | undefined): boolean {
  // 409 is ConflictError: the SDK marks it non-retryable, and a reused
  // idempotency key with changed content can never succeed on replay.
  return (
    status === 408 || status === 425 || status === 429 || (status !== undefined && status >= 500)
  );
}

function deliveryOf(error: ErrorRecord): "not_sent" | "unknown" {
  const tag = error["_tag"];
  if (tag === "SamvaTransportError") return "unknown";
  if (tag === "EmailChannelError" && error.reason === "transport") return "unknown";
  return typeof tag === "string" && knownNotSentTags.has(tag) ? "not_sent" : "unknown";
}

/** Preserve an abort so Email SDK core can apply its own abort semantics. */
export function isAbortFailure(error: unknown, signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true || (error instanceof Error && error.name === "AbortError");
}

/** Convert Samva API and transport failures without retaining provider bodies or credentials. */
export function toEmailAdapterError(error: unknown): EmailAdapterError {
  const record = isRecord(error) ? error : {};
  const status = statusOf(record);
  const requestId = requestIdOf(record);
  return new EmailAdapterError("Samva email send failed.", {
    adapter: "samva",
    ...(status === undefined ? {} : { status }),
    ...(requestId === undefined ? {} : { requestId }),
    retryable: isRetryableStatus(status),
    delivery: deliveryOf(record),
  });
}
