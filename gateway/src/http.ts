import { randomUUID } from "node:crypto";

import type { ErrorEnvelope } from "./contracts.ts";
import { asGatewayError, GatewayError } from "./errors.ts";

export type HeaderValue = string | string[] | undefined;

export interface NodeRequestLike {
  method?: string;
  headers: Record<string, HeaderValue>;
  body?: unknown;
  on?: (event: string, listener: () => void) => unknown;
  off?: (event: string, listener: () => void) => unknown;
}

export interface NodeResponseLike {
  status: (statusCode: number) => NodeResponseLike;
  setHeader: (name: string, value: string | number | readonly string[]) => unknown;
  json: (body: unknown) => unknown;
  end: () => unknown;
}

export function requestId(): string {
  return randomUUID();
}

export function header(request: NodeRequestLike, name: string): string | undefined {
  const value = request.headers[name.toLocaleLowerCase()];
  return typeof value === "string" ? value : undefined;
}

export function setNoStore(response: NodeResponseLike, id: string): void {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Request-Id", id);
}

export function setCors(
  response: NodeResponseLike,
  origin: string,
  methods = "POST, OPTIONS",
): void {
  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Access-Control-Allow-Methods", methods);
  response.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type",
  );
  response.setHeader(
    "Access-Control-Expose-Headers",
    "Retry-After, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, X-Request-Id",
  );
  response.setHeader("Access-Control-Max-Age", "86400");
  response.setHeader("Vary", "Origin");
}

export function sendError(
  response: NodeResponseLike,
  error: unknown,
  id: string,
): void {
  const normalized = asGatewayError(error);
  if (normalized.retryAfterSeconds !== undefined) {
    response.setHeader("Retry-After", normalized.retryAfterSeconds);
  }
  const body: ErrorEnvelope = {
    error: {
      code: normalized.code,
      message: normalized.message,
      retryable: normalized.retryable,
      requestId: id,
    },
  };
  // Never log request bodies, transcripts, prompts, provider responses, or secrets.
  if (normalized.status >= 500) {
    console.error("gateway_request_failed", {
      code: normalized.code,
      requestId: id,
      status: normalized.status,
    });
  }
  response.status(normalized.status).json(body);
}

export function assertAllowedOrigin(
  origin: string | undefined,
  allowedOrigins: ReadonlySet<string>,
): asserts origin is string {
  if (!origin || !allowedOrigins.has(origin)) {
    throw new GatewayError("ORIGIN_FORBIDDEN", 403, false);
  }
}
