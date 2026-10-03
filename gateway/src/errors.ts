export type ErrorCode =
  | "BAD_REQUEST"
  | "CONTENT_BLOCKED"
  | "INTERNAL_ERROR"
  | "METHOD_NOT_ALLOWED"
  | "ORIGIN_FORBIDDEN"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "RATE_LIMIT_UNAVAILABLE"
  | "REQUEST_TIMEOUT"
  | "SERVER_NOT_CONFIGURED"
  | "UPSTREAM_AUTH_ERROR"
  | "UPSTREAM_INVALID_RESPONSE"
  | "UPSTREAM_RATE_LIMITED"
  | "UPSTREAM_REJECTED"
  | "UPSTREAM_UNAVAILABLE";

const PUBLIC_MESSAGES: Record<ErrorCode, string> = {
  BAD_REQUEST: "The request is invalid.",
  CONTENT_BLOCKED: "The requested content was blocked by the AI safety policy.",
  INTERNAL_ERROR: "The gateway could not complete the request.",
  METHOD_NOT_ALLOWED: "The HTTP method is not allowed.",
  ORIGIN_FORBIDDEN: "This extension origin is not allowed.",
  PAYLOAD_TOO_LARGE: "The request payload is too large.",
  RATE_LIMITED: "Too many requests. Please try again later.",
  RATE_LIMIT_UNAVAILABLE: "Request metering is temporarily unavailable.",
  REQUEST_TIMEOUT: "The AI request timed out.",
  SERVER_NOT_CONFIGURED: "The gateway is not configured.",
  UPSTREAM_AUTH_ERROR: "The AI provider is not configured correctly.",
  UPSTREAM_INVALID_RESPONSE: "The AI provider returned an invalid response.",
  UPSTREAM_RATE_LIMITED: "The AI provider is temporarily rate limited.",
  UPSTREAM_REJECTED: "The AI provider rejected the generated request.",
  UPSTREAM_UNAVAILABLE: "The AI provider is temporarily unavailable.",
};

export class GatewayError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly retryAfterSeconds?: number;

  constructor(
    code: ErrorCode,
    status: number,
    retryable: boolean,
    options: { cause?: unknown; retryAfterSeconds?: number } = {},
  ) {
    super(PUBLIC_MESSAGES[code], options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "GatewayError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
    if (options.retryAfterSeconds !== undefined) {
      this.retryAfterSeconds = options.retryAfterSeconds;
    }
  }
}

export function badRequest(cause?: unknown): GatewayError {
  return new GatewayError("BAD_REQUEST", 400, false, { cause });
}

export function asGatewayError(error: unknown): GatewayError {
  if (error instanceof GatewayError) {
    return error;
  }
  return new GatewayError("INTERNAL_ERROR", 500, false, { cause: error });
}
