import { isRecord } from "./input-validation.ts";

const MAX_ERROR_BYTES = 16 * 1024;
const ERROR_READ_TIMEOUT_MS = 1_000;
const SAFE_CODES = new Set([
  "invalid_request", "invalid_argument", "failed_precondition", "out_of_range",
  "parameter_unknown", "authentication", "unauthenticated", "payment_required",
  "permission_denied", "not_found", "model_not_found", "already_exists", "aborted",
  "rate_limit_exceeded", "quota_exceeded", "too_many_requests", "resource_exhausted",
  "cancelled", "api_error", "internal", "unimplemented", "service_unavailable",
  "unavailable", "deadline_exceeded", "unknown",
]);
const SAFE_REASONS = new Set([
  "RATE_LIMIT_EXCEEDED", "QUOTA_EXCEEDED", "BILLING_DISABLED", "SERVICE_DISABLED",
  "API_KEY_INVALID", "API_KEY_EXPIRED", "API_KEY_SERVICE_BLOCKED",
  "API_KEY_HTTP_REFERRER_BLOCKED", "API_KEY_IP_ADDRESS_BLOCKED", "CONSUMER_INVALID",
]);

export interface QuotaDiagnostic {
  metric?: string;
  quotaId?: string;
  limit?: string;
}

export interface ProviderDiagnostics {
  providerStatus: number;
  providerCode?: string;
  providerReason?: string;
  // Fixed summaries only: never copy arbitrary provider messages into logs.
  messageHints?: string[];
  quotaViolations?: QuotaDiagnostic[];
  retryAfterSeconds?: number;
  errorBodyState: "parsed" | "unavailable";
}

function seconds(value: unknown): number | undefined {
  if (typeof value !== "string" || !/^\d+(?:\.\d+)?s?$/u.test(value)) return undefined;
  const parsed = Math.ceil(Number(value.replace(/s$/u, "")));
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

export function providerRetryAfter(response: Response): number | undefined {
  const raw = response.headers.get("retry-after")?.trim();
  if (!raw) return undefined;
  const numeric = seconds(raw);
  if (numeric !== undefined) return numeric;
  if (/^[+-]?\d/u.test(raw)) return undefined;
  const date = Date.parse(raw);
  return Number.isFinite(date) ? Math.max(0, Math.ceil((date - Date.now()) / 1_000)) : undefined;
}

function quotaDiagnostic(value: Record<string, unknown>): QuotaDiagnostic | undefined {
  const result: QuotaDiagnostic = {};
  if (typeof value.quotaMetric === "string" &&
    /^generativelanguage\.googleapis\.com\/[a-z_]{1,120}$/u.test(value.quotaMetric)) {
    result.metric = value.quotaMetric;
  }
  if (typeof value.quotaId === "string" &&
    /^(?:GenerateContent|Interactions)[A-Za-z0-9_-]{0,120}$/u.test(value.quotaId)) {
    result.quotaId = value.quotaId;
  }
  const limit = value.quotaValue;
  if ((typeof limit === "string" && /^\d{1,20}$/u.test(limit)) ||
    (typeof limit === "number" && Number.isSafeInteger(limit) && limit >= 0)) {
    result.limit = String(limit);
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function parseDiagnostics(body: unknown, result: ProviderDiagnostics): void {
  if (!isRecord(body) || !isRecord(body.error)) return;
  result.errorBodyState = "parsed";
  const error = body.error;
  for (const value of [error.code, error.status]) {
    if (typeof value === "string" && SAFE_CODES.has(value.toLowerCase())) {
      result.providerCode = value.toLowerCase();
      break;
    }
  }
  const quotas: QuotaDiagnostic[] = [];
  if (Array.isArray(error.details)) {
    for (const detail of error.details.slice(0, 20)) {
      if (!isRecord(detail)) continue;
      if (detail["@type"] === "type.googleapis.com/google.rpc.QuotaFailure" &&
        Array.isArray(detail.violations)) {
        for (const violation of detail.violations.slice(0, 10)) {
          if (!isRecord(violation)) continue;
          const quota = quotaDiagnostic(violation);
          if (quota && quotas.length < 10) quotas.push(quota);
        }
      }
      if (detail["@type"] === "type.googleapis.com/google.rpc.ErrorInfo" &&
        typeof detail.reason === "string" && SAFE_REASONS.has(detail.reason)) {
        result.providerReason = detail.reason;
      }
      if (detail["@type"] === "type.googleapis.com/google.rpc.RetryInfo") {
        const retry = seconds(detail.retryDelay);
        if (retry !== undefined) {
          result.retryAfterSeconds = Math.max(result.retryAfterSeconds ?? 0, retry);
        }
      }
    }
  }
  // Interactions errors can contain just code + message, without RPC details.
  // Extract recognized signals; omit prompts, URLs, project IDs and unknown text.
  if (typeof error.message === "string") {
    const message = error.message;
    const hints: string[] = [];
    if (/exceeded your (?:current |daily )?quota|quota (?:has been )?exceeded/iu.test(message)) {
      hints.push("provider_reports_quota_exceeded");
    }
    if (/per[ -]day|daily quota|requests per day/iu.test(message)) hints.push("daily_limit_mentioned");
    if (/per[ -]minute|requests per minute|tokens per minute/iu.test(message)) hints.push("minute_limit_mentioned");
    if (/check your plan and billing/iu.test(message)) hints.push("provider_requests_plan_and_billing_check");
    if (/billing (?:is |has been )?disabled|billing (?:must be enabled|is required)/iu.test(message)) {
      hints.push("provider_reports_billing_required");
    }
    if (/too many requests/iu.test(message)) hints.push("provider_reports_too_many_requests");
    if (hints.length > 0) result.messageHints = hints;
    for (const match of message.matchAll(/Quota exceeded for metric: (generativelanguage\.googleapis\.com\/[a-z_]{1,120}), limit: (\d{1,20})\b/gu)) {
      if (quotas.length < 10) quotas.push({ metric: match[1]!, limit: match[2]! });
    }
    const retry = seconds(/Please retry in (\d+(?:\.\d+)?s)\b/iu.exec(message)?.[1]);
    if (retry !== undefined) result.retryAfterSeconds = Math.max(result.retryAfterSeconds ?? 0, retry);
  }
  if (quotas.length > 0) result.quotaViolations = quotas;
}

/** Read a small, bounded error body. A diagnostics failure must preserve the HTTP error. */
export async function readProviderDiagnostics(
  response: Response,
  signal: AbortSignal,
): Promise<ProviderDiagnostics> {
  const result: ProviderDiagnostics = { providerStatus: response.status, errorBodyState: "unavailable" };
  const retry = providerRetryAfter(response);
  if (retry !== undefined) result.retryAfterSeconds = retry;
  const reader = response.body?.getReader();
  if (!reader) return result;
  let cancelled = false;
  const cancel = () => { cancelled = true; void reader.cancel().catch(() => undefined); };
  const timer = setTimeout(cancel, ERROR_READ_TIMEOUT_MS);
  signal.addEventListener("abort", cancel, { once: true });
  try {
    if (signal.aborted || Number(response.headers.get("content-length")) > MAX_ERROR_BYTES) {
      cancel();
      return result;
    }
    const decoder = new TextDecoder();
    let source = "";
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_ERROR_BYTES) { cancel(); return result; }
      source += decoder.decode(value, { stream: true });
    }
    if (!cancelled) parseDiagnostics(JSON.parse(source + decoder.decode()) as unknown, result);
  } catch {
    // Non-JSON bodies, network failures and aborted reads carry no safe details.
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
  return result;
}
