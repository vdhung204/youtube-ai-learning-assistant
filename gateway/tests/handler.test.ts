import assert from "node:assert/strict";
import test from "node:test";

import { generateHandler } from "../src/generate-handler.ts";
import { sendError, type NodeRequestLike, type NodeResponseLike } from "../src/http.ts";
import { GatewayError } from "../src/errors.ts";
import { ORIGIN, rawQuestionsRequest } from "./fixtures.ts";

class TestResponse implements NodeResponseLike {
  statusCode = 200;
  headers = new Map<string, string>();
  body: unknown;

  status(statusCode: number): NodeResponseLike {
    this.statusCode = statusCode;
    return this;
  }

  setHeader(name: string, value: string | number | readonly string[]): void {
    this.headers.set(name.toLocaleLowerCase(), Array.isArray(value) ? value.join(", ") : String(value));
  }

  json(body: unknown): void {
    this.body = body;
  }

  end(): void {}
}

function withEnvironment(callback: () => Promise<void>): Promise<void> {
  const original = { ...process.env };
  process.env.GEMINI_API_KEY = "server-only-secret";
  process.env.GEMINI_MODEL = "gemini-3.6-flash";
  process.env.ALLOWED_EXTENSION_ORIGINS = ORIGIN;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  return callback().finally(() => {
    process.env = original;
  });
}

test("answers an allowed CORS preflight without contacting Gemini", async () => withEnvironment(async () => {
  const request: NodeRequestLike = {
    method: "OPTIONS",
    headers: { origin: ORIGIN },
  };
  const response = new TestResponse();
  await generateHandler(request, response);
  assert.equal(response.statusCode, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), ORIGIN);
  assert.equal(response.headers.get("access-control-allow-headers"), "Content-Type");
  assert.match(response.headers.get("access-control-expose-headers") ?? "", /Retry-After/u);
}));

test("rejects a non-allowlisted extension origin", async () => withEnvironment(async () => {
  const request: NodeRequestLike = {
    method: "POST",
    headers: {
      origin: "chrome-extension://pppppppppppppppppppppppppppppppp",
      "content-type": "application/json",
    },
    body: rawQuestionsRequest,
  };
  const response = new TestResponse();
  await generateHandler(request, response);
  assert.equal(response.statusCode, 403);
  assert.equal((response.body as { error: { code: string } }).error.code, "ORIGIN_FORBIDDEN");
  assert.equal(response.headers.has("access-control-allow-origin"), false);
}));

test("rejects arbitrary provider controls before making an upstream call", async () => withEnvironment(async () => {
  const request: NodeRequestLike = {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json" },
    body: { ...rawQuestionsRequest, model: "attacker-model" },
  };
  const response = new TestResponse();
  await generateHandler(request, response);
  assert.equal(response.statusCode, 400);
  assert.equal((response.body as { error: { code: string } }).error.code, "BAD_REQUEST");
  assert.equal(response.headers.get("access-control-allow-origin"), ORIGIN);
  assert.match(response.headers.get("access-control-expose-headers") ?? "", /X-Request-Id/u);
}));

test("logs provider diagnostics for 429 without exposing them in the public response", (t) => {
  const log = t.mock.method(console, "warn", () => {});
  const response = new TestResponse();
  const diagnostics = {
    providerStatus: 429, providerCode: "too_many_requests", model: "gemini-3.6-flash",
    attempt: 1, errorBodyState: "parsed" as const,
    quotaViolations: [{ metric: "generativelanguage.googleapis.com/generate_content_free_tier_requests", limit: "0" }],
  };
  sendError(response, new GatewayError("UPSTREAM_RATE_LIMITED", 429, true, {
    retryAfterSeconds: 18643, providerDiagnostics: diagnostics,
  }), "diagnostic-request");
  assert.equal(response.statusCode, 429);
  assert.equal(response.headers.get("retry-after"), "18643");
  assert.deepEqual(log.mock.calls[0]?.arguments, ["gateway_request_failed", {
    code: "UPSTREAM_RATE_LIMITED", requestId: "diagnostic-request", status: 429,
    providerDiagnostics: diagnostics,
  }]);
  assert.equal(JSON.stringify(response.body).includes("quotaViolations"), false);
  assert.equal(JSON.stringify(response.body).includes("gemini-3.6-flash"), false);
});
