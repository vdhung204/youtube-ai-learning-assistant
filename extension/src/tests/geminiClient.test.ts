import { afterEach, describe, expect, it, vi } from "vitest";
import {
  generateContent,
  GeminiAccessError,
  resolveGeminiModel,
  resolveGeminiModels,
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
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Gemini generateContent transport", () => {
  it("uses Gemini 3.8 Flash when no model override is provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(generationResponse('{"answer":"RAG"}'));
    vi.stubGlobal("fetch", fetchMock);

    await generateContent("token", prompt);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
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
    expect(requestBody.generationConfig.responseSchema).not.toHaveProperty("additionalProperties");
    expect(requestBody.generationConfig.responseSchema.properties.metadata).not.toHaveProperty(
      "additionalProperties",
    );
  });

  it("sends a supported low thinking level for latency-sensitive generation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(generationResponse('{"answer":"RAG"}'));
    vi.stubGlobal("fetch", fetchMock);

    await generateContent("token", prompt, {
      model: "gemini-3.8-flash",
      thinkingLevel: "LOW",
    });

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(requestBody.generationConfig.thinkingConfig).toEqual({
      thinkingLevel: "LOW",
    });
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
      generateContent("token", prompt, { maxRetries: 0, model: "gemini-test" }),
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
      generateContent("token", prompt, { maxRetries: 0, model: "gemini-test" }),
    ).rejects.toMatchObject({
      code,
      retryable,
      status,
      ...(status === 429 ? { retryAfterMs: 4_000 } : {}),
    } satisfies Partial<GeminiAccessError>);
  });

  it("does not repeat a generic bad request without structured schema", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: 400, message: "Request contains an invalid argument." },
        }),
        { status: 400 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      generateContent("token", prompt, { maxRetries: 3, model: "gemini-test" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("retries a temporary 503 with exponential backoff and then succeeds", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockResolvedValueOnce(generationResponse('{"answer":"recovered"}'));
    vi.stubGlobal("fetch", fetchMock);

    const generation = generateContent("token", prompt, {
      maxRetries: 2,
      model: "gemini-test",
    });
    await vi.runAllTimersAsync();

    await expect(generation).resolves.toEqual({ answer: "recovered" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("never automatically retries a quota response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      generateContent("token", prompt, { maxRetries: 3, model: "gemini-test" }),
    ).rejects.toMatchObject({ code: "QUOTA_EXCEEDED" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("switches to an available fallback model after a transient failure", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockResolvedValueOnce(generationResponse('{"answer":"fallback"}'));
    vi.stubGlobal("fetch", fetchMock);

    const generation = generateContent("token", prompt, {
      fallbackModels: ["gemini-backup"],
      model: "gemini-primary",
    });
    await vi.runAllTimersAsync();

    await expect(generation).resolves.toEqual({ answer: "fallback" });
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-primary:generateContent",
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-backup:generateContent",
    ]);
  });

  it("never retries with a Flash fallback below 3.6", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockResolvedValueOnce(generationResponse('{"answer":"same-model"}'));
    vi.stubGlobal("fetch", fetchMock);

    const generation = generateContent("token", prompt, {
      fallbackModels: ["gemini-2.5-flash"],
      model: "gemini-3.8-flash",
    });
    await vi.runAllTimersAsync();

    await expect(generation).resolves.toEqual({ answer: "same-model" });
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
    ]);
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

describe("Gemini response boundaries", () => {
  it("joins visible text in the first candidate and excludes thought content", async () => {
    const body = {
      candidates: [
        {
          finishReason: "STOP",
          content: { parts: [
            { thought: true, text: "private reasoning, not JSON" },
            { text: '{"answer":' },
            { inlineData: { data: "ignored" } },
            { text: '"grounded"}' },
          ] },
        },
        { content: { parts: [{ text: '{"answer":"second candidate"}' }] } },
      ],
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body)));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateContent("token", prompt)).resolves.toEqual({ answer: "grounded" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([
    { body: null, message: "Gemini trả về dữ liệu không hợp lệ." },
    { body: { candidates: [] }, message: "Gemini không trả về nội dung." },
    { body: { candidates: [null] }, message: "Gemini trả về dữ liệu không hợp lệ." },
    { body: { candidates: [{}] }, message: "Gemini không trả về nội dung JSON." },
    { body: { candidates: [{ content: { parts: [] } }] }, message: "Gemini không trả về nội dung JSON." },
    {
      body: { candidates: [{ content: { parts: [{ thought: true, text: "hidden" }] } }] },
      message: "Gemini không trả về nội dung JSON.",
    },
  ])("preserves invalid-response errors without an extra API call: $message", async ({ body, message }) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body)));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateContent("token", prompt)).rejects.toMatchObject({
      code: "INVALID_RESPONSE", message, retryable: true, status: 200,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each(["SAFETY", "BLOCKLIST", "PROHIBITED_CONTENT", "RECITATION", "SPII"])(
    "handles %s before checking missing candidate content",
    async (finishReason) => {
      const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ finishReason }] })));
      vi.stubGlobal("fetch", fetchMock);

      await expect(generateContent("token", prompt)).rejects.toMatchObject({
        code: "CONTENT_BLOCKED", message: "Gemini đã chặn nội dung theo chính sách an toàn.", retryable: false,
      });
      expect(fetchMock).toHaveBeenCalledOnce();
    },
  );
});

describe("Gemini model resolution", () => {
  it("selects a supported Flash model at or above 3.6 and never sends credentials as cookies", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          models: [
            { name: "models/text-model", supportedGenerationMethods: ["generateContent"] },
            { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] },
            { name: "models/gemini-3.6-flash", supportedGenerationMethods: ["generateContent"] },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(resolveGeminiModel("token")).resolves.toBe("models/gemini-3.6-flash");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ credentials: "omit" });
  });

  it("returns the configured model first and excludes Flash fallbacks below 3.6", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            models: [
              { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] },
              { name: "models/gemini-3.6-flash", supportedGenerationMethods: ["generateContent"] },
              { name: "models/gemini-3.7-flash", supportedGenerationMethods: ["generateContent"] },
              { name: "models/gemini-3.8-flash", supportedGenerationMethods: ["generateContent"] },
              { name: "models/gemini-3.8-flash-tts", supportedGenerationMethods: ["generateContent"] },
              { name: "models/gemini-4-flash-preview", supportedGenerationMethods: ["generateContent"] },
            ],
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(
      resolveGeminiModels("token", { preferredModel: "gemini-3.8-flash" }),
    ).resolves.toEqual([
      "models/gemini-3.8-flash",
      "models/gemini-3.7-flash",
      "models/gemini-3.6-flash",
    ]);
  });

  it("rejects model catalogs that only offer Flash versions below 3.6", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            models: [
              { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] },
            ],
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(resolveGeminiModels("token")).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
    });
  });
});
