export type GeminiAccessErrorCode =
  | "TOKEN_EXPIRED"
  | "PERMISSION_DENIED"
  | "QUOTA_EXCEEDED"
  | "BAD_REQUEST"
  | "CONTENT_BLOCKED"
  | "OUTPUT_TRUNCATED"
  | "UNAVAILABLE"
  | "INVALID_RESPONSE"
  | "ABORTED";

export class GeminiAccessError extends Error {
  readonly code: GeminiAccessErrorCode;
  readonly retryable: boolean;
  readonly status?: number;
  readonly retryAfterMs?: number;

  constructor(
    code: GeminiAccessErrorCode,
    message: string,
    status?: number,
    options: { retryable?: boolean; retryAfterMs?: number } = {},
  ) {
    super(message);
    this.name = "GeminiAccessError";
    this.code = code;
    this.status = status;
    this.retryable = options.retryable ?? ["QUOTA_EXCEEDED", "UNAVAILABLE"].includes(code);
    this.retryAfterMs = options.retryAfterMs;
  }
}
