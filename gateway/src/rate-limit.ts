import { createHash } from "node:crypto";

import type { RateLimitConfig } from "./config.ts";
import { GatewayError } from "./errors.ts";
import type { NodeRequestLike } from "./http.ts";
import { header } from "./http.ts";
import { isRecord } from "./input-validation.ts";

const REDIS_TIMEOUT_MS = 2_000;

export interface RateLimitResult {
  limit: number;
  remaining: number;
  resetEpochSeconds: number;
}

function identity(request: NodeRequestLike, origin: string): string {
  // Vercel overwrites these headers with the public client IP. Prefer the
  // Vercel-specific form so a proxy in front of the deployment cannot replace it.
  const forwardedFor = (
    header(request, "x-vercel-forwarded-for") ?? header(request, "x-forwarded-for")
  )?.split(",", 1)[0]?.trim().slice(0, 64);
  const rawIdentity = forwardedFor || "unknown";
  return createHash("sha256").update(`${origin}\0${rawIdentity}`).digest("hex");
}

function parsePipelineCount(value: unknown): number {
  if (!Array.isArray(value) || !isRecord(value[0]) || typeof value[0].result !== "number") {
    throw new GatewayError("RATE_LIMIT_UNAVAILABLE", 503, true);
  }
  return value[0].result;
}

export async function enforceRateLimit(
  request: NodeRequestLike,
  origin: string,
  config: RateLimitConfig | undefined,
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<RateLimitResult | undefined> {
  if (!config) {
    return undefined;
  }
  const nowSeconds = Math.floor(Date.now() / 1_000);
  const bucket = Math.floor(nowSeconds / config.windowSeconds);
  const resetEpochSeconds = (bucket + 1) * config.windowSeconds;
  const key = `yala:gateway:v1:${identity(request, origin)}:${bucket}`;
  const redisSignal = AbortSignal.any([signal, AbortSignal.timeout(REDIS_TIMEOUT_MS)]);
  let response: Response;
  try {
    response = await fetchImpl(`${config.url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", key],
        ["EXPIRE", key, String(config.windowSeconds * 2)],
      ]),
      credentials: "omit",
      signal: redisSignal,
    });
  } catch (error) {
    throw new GatewayError("RATE_LIMIT_UNAVAILABLE", 503, true, { cause: error });
  }
  if (!response.ok) {
    throw new GatewayError("RATE_LIMIT_UNAVAILABLE", 503, true);
  }
  let result: unknown;
  try {
    result = await response.json() as unknown;
  } catch (error) {
    throw new GatewayError("RATE_LIMIT_UNAVAILABLE", 503, true, { cause: error });
  }
  const count = parsePipelineCount(result);
  if (count > config.maxRequests) {
    throw new GatewayError("RATE_LIMITED", 429, true, {
      retryAfterSeconds: Math.max(1, resetEpochSeconds - nowSeconds),
    });
  }
  return {
    limit: config.maxRequests,
    remaining: Math.max(0, config.maxRequests - count),
    resetEpochSeconds,
  };
}
