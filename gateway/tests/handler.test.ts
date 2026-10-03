import assert from "node:assert/strict";
import test from "node:test";

import { generateHandler } from "../src/generate-handler.ts";
import type { NodeRequestLike, NodeResponseLike } from "../src/http.ts";
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
