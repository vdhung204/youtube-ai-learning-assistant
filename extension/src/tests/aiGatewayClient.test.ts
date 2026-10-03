import { afterEach, describe, expect, it, vi } from "vitest";

import { buildChatRequest, buildQuizRequest, type SourceContext } from "../ai-content/index.ts";
import {
  AiGatewayError,
  generateContent,
  resolveGatewayEndpoint,
} from "../integrations/ai-gateway/client.ts";

const context: SourceContext = {
  videoId: "video000001",
  durationSec: 180,
  chunks: [
    {
      chunkId: "chunk-01",
      videoId: "video000001",
      text: "A tuple is immutable after it is created.",
      position: 0,
      score: 0.9,
      startSec: 10,
      endSec: 20,
    },
  ],
};

const quizItem = {
  question: "What property does a tuple have?",
  options: ["Immutable", "Mutable", "Networked", "Encrypted"],
  correctAnswer: 0,
  explanation: "The transcript says that a tuple is immutable.",
  topic: "Tuple",
  sourceChunkId: "chunk-01",
  evidence: "A tuple is immutable after it is created.",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AI Gateway client contract", () => {
  it("sends only allowlisted business data and normalizes the gateway envelope", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({
      data: { status: "ok", items: [quizItem] },
      meta: { requestId: "request-01" },
    }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    }));
    vi.stubGlobal("fetch", fetchMock);
    const validate = vi.fn((value: unknown) => value);

    const result = await generateContent(buildQuizRequest(context, 1), {
      maxRetries: 0,
      validate,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(resolveGatewayEndpoint());
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toEqual({
      context,
      language: "vi",
      requestedCount: 1,
      task: "questions",
    });
    expect(body).not.toHaveProperty("apiKey");
    expect(body).not.toHaveProperty("model");
    expect(body).not.toHaveProperty("prompt");
    expect(body).not.toHaveProperty("schema");
    expect(validate).toHaveBeenCalledWith({ status: "ok", questions: [quizItem] });
    expect(result).toEqual({ status: "ok", questions: [quizItem] });
  });

  it("does not add count or server policy fields to an answer request", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({
      data: {
        status: "ok",
        items: [{
          answer: "It is immutable.",
          topic: "Tuple",
          sourceChunkId: "chunk-01",
          evidence: "A tuple is immutable after it is created.",
        }],
      },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await generateContent(buildChatRequest(context, "Can a tuple change?"), { maxRetries: 0 });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(body).toEqual({
      context,
      language: "vi",
      question: "Can a tuple change?",
      task: "answers",
    });
    expect(body).not.toHaveProperty("requestedCount");
  });

  it("maps a gateway 429 and preserves Retry-After for callers", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      error: { code: "RATE_LIMITED", retryable: true },
    }), {
      headers: { "Content-Type": "application/json", "Retry-After": "3" },
      status: 429,
    })));

    const promise = generateContent(buildQuizRequest(context, 1), { maxRetries: 0 });
    await expect(promise).rejects.toMatchObject({
      code: "RATE_LIMITED",
      retryAfterMs: 3_000,
      retryable: true,
      status: 429,
    } satisfies Partial<AiGatewayError>);
  });

  it("does not retry a gateway 503 by default", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      error: { code: "UPSTREAM_UNAVAILABLE", retryable: true },
    }), {
      headers: { "Content-Type": "application/json", "Retry-After": "30" },
      status: 503,
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateContent(buildQuizRequest(context, 1))).rejects.toMatchObject({
      code: "SERVER_ERROR",
      retryAfterMs: 30_000,
      retryable: true,
      status: 503,
    } satisfies Partial<AiGatewayError>);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("accepts HTTPS and local HTTP gateway origins only", () => {
    expect(resolveGatewayEndpoint("https://api.example.com/base/")).toBe(
      "https://api.example.com/base/api/generate",
    );
    expect(resolveGatewayEndpoint("http://localhost:3000")).toBe(
      "http://localhost:3000/api/generate",
    );
    expect(() => resolveGatewayEndpoint("http://api.example.com")).toThrow(AiGatewayError);
  });
});
