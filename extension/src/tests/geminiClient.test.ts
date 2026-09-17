import { afterEach, describe, expect, it, vi } from "vitest";
import {
  generateContent,
  GeminiAccessError,
  resolveGeminiModel,
  type GeminiPromptInput,
} from "../integrations/gemini/client";

const prompt: GeminiPromptInput = {
  responseSchema: {
    additionalProperties: false,
    properties: {
      answer: { type: "string" },
      metadata: {
        additionalProperties: false,
        properties: { source: { type: "string" } },
        type: "object",
      },
      options: { items: { type: "string" }, maxItems: 4, minItems: 2 },
      score: { minimum: 0, type: "number" },
    },
    required: ["answer"],
    type: "object",
  },
  systemInstruction: "Use only the supplied context.",
  userContent: JSON.stringify({ context: "retrieved transcript", question: "What is RAG?" }),
};

function generationResponse(text: string, finishReason = "STOP"): Response {
  return new Response(
    JSON.stringify({
      candidates: [
        {
          content: { parts: [{ text }], role: "model" },
          finishReason,
        },
      ],
    }),
    { status: 200 },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Gemini generateContent transport", () => {
  it("uses Gemini 3.6 Flash when no model override is provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(generationResponse('{"answer":"RAG"}'));
    vi.stubGlobal("fetch", fetchMock);

    await generateContent("token", prompt);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
    );
  });

  it("sends an OAuth-authenticated structured-output request and validates parsed JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(generationResponse('{"answer":"RAG"}'));
    vi.stubGlobal("fetch", fetchMock);
    const validate = vi.fn((value: unknown) => {
      if (
        typeof value !== "object" ||
        value === null ||
        !("answer" in value) ||
        typeof value.answer !== "string"
      ) {
        throw new Error("invalid answer");
      }
      return value.answer;
    });

    await expect(
      generateContent("private-oauth-token", prompt, {
        model: "models/gemini-test",
        projectId: "test-project",
        validate,
      }),
    ).resolves.toBe("RAG");

    expect(validate).toHaveBeenCalledWith({ answer: "RAG" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent",
    );
    expect(init).toMatchObject({ credentials: "omit", method: "POST" });
    expect(new Headers(init.headers)).toEqual(
      new Headers({
        Accept: "application/json",
        Authorization: "Bearer private-oauth-token",
        "Content-Type": "application/json",
        "x-goog-user-project": "test-project",
      }),
    );
    const requestBody = JSON.parse(String(init.body));
    expect(requestBody).toMatchObject({
      contents: [{ parts: [{ text: prompt.userContent }], role: "user" }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          properties: {
            answer: { type: "string" },
            metadata: {
              additionalProperties: false,
              properties: { source: { type: "string" } },
              type: "object",
            },
            options: { items: { type: "string" }, maxItems: 4, minItems: 2 },
            score: { minimum: 0, type: "number" },
          },
          required: ["answer"],
          type: "object",
        },
      },
      systemInstruction: {
        parts: [{ text: prompt.systemInstruction }],
      },
    });
    expect(requestBody.generationConfig).not.toHaveProperty("responseJsonSchema");
    expect(requestBody.generationConfig.responseSchema.additionalProperties).toBe(false);
  });

  it("falls back to JSON mode when the endpoint rejects structured schema", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: 400,
              message: 'Invalid JSON payload received. Unknown name "responseSchema".',
              status: "INVALID_ARGUMENT",
            },
          }),
          { status: 400 },
        ),
      )
      .mockResolvedValueOnce(generationResponse('{"answer":"RAG"}'));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateContent("token", prompt, { model: "gemini-test" })).resolves.toEqual({
      answer: "RAG",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retryBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(retryBody.generationConfig).not.toHaveProperty("responseSchema");
    expect(retryBody.generationConfig).not.toHaveProperty("responseJsonSchema");
    expect(retryBody.generationConfig.responseMimeType).toBe("application/json");
    expect(retryBody.systemInstruction.parts[0].text).toContain("Output JSON schema:");
    expect(retryBody.systemInstruction.parts[0].text).toContain("additionalProperties");
  });

  it("preserves Google's bounded error detail when both schema modes are rejected", async () => {
    const schemaErrorResponse = () =>
      new Response(
        JSON.stringify({
          error: {
            code: 400,
            message: 'Invalid JSON payload received. Unknown name "responseSchema".',
            status: "INVALID_ARGUMENT",
          },
        }),
        { status: 400 },
      );
    const jsonModeErrorResponse = () =>
      new Response(
        JSON.stringify({
          error: {
            code: 400,
            message: "Request contains an invalid argument.",
            status: "INVALID_ARGUMENT",
          },
        }),
        { status: 400 },
      );
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(schemaErrorResponse())
        .mockResolvedValueOnce(jsonModeErrorResponse()),
    );

    await expect(
      generateContent("token", prompt, { model: "gemini-test" }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Gemini từ chối yêu cầu. Chi tiết Google: Request contains an invalid argument.",
      status: 400,
    } satisfies Partial<GeminiAccessError>);
  });

  it("accepts an exact JSON markdown fence but rejects malformed output", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(generationResponse('```json\n{"answer":"grounded"}\n```'))
      .mockResolvedValueOnce(generationResponse("prefix {not-json}"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      generateContent("token", prompt, { model: "gemini-test" }),
    ).resolves.toEqual({ answer: "grounded" });
    await expect(
      generateContent("token", prompt, { model: "gemini-test" }),
    ).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      retryable: true,
    } satisfies Partial<GeminiAccessError>);
  });

  it("classifies a max-token response as truncated before parsing partial JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(generationResponse('{"answer":"partial', "MAX_TOKENS")),
    );

    await expect(
      generateContent("token", prompt, { model: "gemini-test" }),
    ).rejects.toMatchObject({
      code: "OUTPUT_TRUNCATED",
      retryable: true,
    } satisfies Partial<GeminiAccessError>);
  });

  it("keeps schema validation as an explicit boundary", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(generationResponse('{"answer":"RAG"}')));
    const validationError = new Error("schema rejected");

    await expect(
      generateContent("token", prompt, {
        model: "gemini-test",
        validate: () => {
          throw validationError;
        },
      }),
    ).rejects.toBe(validationError);
  });

  it.each([
    [400, "BAD_REQUEST", false],
    [401, "TOKEN_EXPIRED", false],
    [403, "PERMISSION_DENIED", false],
    [429, "QUOTA_EXCEEDED", true],
    [503, "UNAVAILABLE", true],
  ] as const)("maps HTTP %i to %s", async (status, code, retryable) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("{}", {
          headers: status === 429 ? { "Retry-After": "4" } : undefined,
          status,
        }),
      ),
    );

    await expect(
      generateContent("token", prompt, { model: "gemini-test" }),
    ).rejects.toMatchObject({
      code,
      retryable,
      status,
      ...(status === 429 ? { retryAfterMs: 4_000 } : {}),
    } satisfies Partial<GeminiAccessError>);
  });

  it("maps an aborted fetch without treating it as an unavailable network", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        controller.abort();
        if (init?.signal?.aborted) {
          throw new DOMException("aborted", "AbortError");
        }
        return generationResponse("{}");
      }),
    );

    await expect(
      generateContent("token", prompt, {
        model: "gemini-test",
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: "ABORTED", retryable: false });
  });

  it("reports safety blocking without exposing response content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } }), {
          status: 200,
        }),
      ),
    );

    await expect(
      generateContent("token", prompt, { model: "gemini-test" }),
    ).rejects.toMatchObject({ code: "CONTENT_BLOCKED", retryable: false });
  });
});

describe("Gemini model resolution", () => {
  it("selects a generateContent flash model and never sends credentials as cookies", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          models: [
            { name: "models/text-model", supportedGenerationMethods: ["generateContent"] },
            { name: "models/gemini-flash", supportedGenerationMethods: ["generateContent"] },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(resolveGeminiModel("token")).resolves.toBe("models/gemini-flash");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ credentials: "omit" });
  });
});
