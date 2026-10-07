export type AiGatewayErrorCode =
  | "ABORTED"
  | "CONTENT_BLOCKED"
  | "INVALID_REQUEST"
  | "INVALID_RESPONSE"
  | "MISCONFIGURED"
  | "NETWORK_ERROR"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "SERVER_ERROR"
  | "TIMEOUT";

interface AiGatewayErrorOptions {
  cause?: unknown;
  retryAfterMs?: number;
  retryable?: boolean;
  status?: number;
}

export class AiGatewayError extends Error {
  readonly code: AiGatewayErrorCode;
  readonly retryAfterMs?: number;
  readonly retryable: boolean;
  readonly status?: number;

  constructor(code: AiGatewayErrorCode, message: string, options: AiGatewayErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = "AiGatewayError";
    this.code = code;
    this.retryAfterMs = options.retryAfterMs;
    this.retryable = options.retryable ?? false;
    this.status = options.status;
  }
}
