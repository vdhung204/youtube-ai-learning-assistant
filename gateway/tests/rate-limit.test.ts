import assert from "node:assert/strict";
import test from "node:test";

import type { RateLimitConfig } from "../src/config.ts";
import { GatewayError } from "../src/errors.ts";
import { enforceRateLimit } from "../src/rate-limit.ts";
import { ORIGIN } from "./fixtures.ts";

const config: RateLimitConfig = {
  url: "https://example.upstash.io",
  token: "redis-secret",
  maxRequests: 2,
  windowSeconds: 60,
};

const request = {
  headers: {
    "x-vercel-forwarded-for": "203.0.113.10",
  },
};

test("distributed rate limiting returns bounded metadata without exposing identity", async () => {
  let body = "";
  const fetchImpl = (async (_url: URL | RequestInfo, init?: RequestInit) => {
    body = String(init?.body);
    return Response.json([{ result: 1 }, { result: 1 }]);
  }) as typeof fetch;
  const result = await enforceRateLimit(
    request,
    ORIGIN,
    config,
    new AbortController().signal,
    fetchImpl,
  );
  assert.equal(result?.limit, 2);
  assert.equal(result?.remaining, 1);
  assert.equal(body.includes("203.0.113.10"), false);
});

test("configured rate limiting fails closed when Upstash is unavailable", async () => {
  const fetchImpl = (async () => {
    throw new TypeError("network down");
  }) as typeof fetch;
  await assert.rejects(
    enforceRateLimit(
      request,
      ORIGIN,
      config,
      new AbortController().signal,
      fetchImpl,
    ),
    (error: unknown) =>
      error instanceof GatewayError && error.code === "RATE_LIMIT_UNAVAILABLE",
  );
});

test("rejects requests beyond the configured fixed-window limit", async () => {
  const fetchImpl = (async () => Response.json([{ result: 3 }, { result: 1 }])) as typeof fetch;
  await assert.rejects(
    enforceRateLimit(
      request,
      ORIGIN,
      config,
      new AbortController().signal,
      fetchImpl,
    ),
    (error: unknown) => error instanceof GatewayError && error.code === "RATE_LIMITED",
  );
});
