import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GeminiAccessError, type GeminiPromptInput } from "../integrations/gemini/client";
import { useGoogleAuth } from "../sidebar/hooks/useGoogleAuth";
import { createChromeMock } from "./chromeMock";

const prompt: GeminiPromptInput = {
  responseSchema: {
    properties: { answer: { type: "string" } },
    required: ["answer"],
    type: "object",
  },
  systemInstruction: "Answer from the supplied transcript only.",
  userContent: "Question and retrieved context",
};

function modelsResponse(): Response {
  const configuredModel = import.meta.env.VITE_YALA_GEMINI_MODEL?.trim();
  return new Response(
    JSON.stringify({
      models: [
        {
          name: configuredModel ? `models/${configuredModel.replace(/^models\//u, "")}` : "models/gemini-test-flash",
          supportedGenerationMethods: ["generateContent"],
        },
      ],
    }),
    { status: 200 },
  );
}

function contentResponse(): Response {
  return new Response(
    JSON.stringify({
      candidates: [
        {
          content: { parts: [{ text: '{"answer":"grounded"}' }] },
          finishReason: "STOP",
        },
      ],
    }),
    { status: 200 },
  );
}

function userInfoResponse(): Response {
  return new Response(
    JSON.stringify({ email: "learner@example.com", id: "google-account-id" }),
    { status: 200 },
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useGoogleAuth Gemini capability", () => {
  it("keeps the token private and exposes a validated generateContent function", async () => {
    const chromeMock = createChromeMock();
    vi.stubGlobal("chrome", chromeMock);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      return url.includes(":generateContent")
        ? contentResponse()
        : url.includes("/oauth2/v2/userinfo")
          ? userInfoResponse()
          : modelsResponse();
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useGoogleAuth());
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    expect(result.current).not.toHaveProperty("token");

    let answer: string | undefined;
    await act(async () => {
      answer = await result.current.generateContent(prompt, {
        validate: (value) => {
          if (
            typeof value !== "object" ||
            value === null ||
            !("answer" in value) ||
            typeof value.answer !== "string"
          ) {
            throw new Error("invalid");
          }
          return value.answer;
        },
      });
    });

    expect(answer).toBe("grounded");
    const generationCall = fetchMock.mock.calls.find(([input]) =>
      String(input).includes(":generateContent"),
    );
    expect(generationCall).toBeDefined();
    expect(new Headers(generationCall?.[1]?.headers).get("Authorization")).toBe(
      "Bearer test-google-access-token",
    );
    expect(generationCall?.[1]).toMatchObject({ credentials: "omit" });
  });

  it("invalidates an expired runtime token and moves auth state to expired", async () => {
    const chromeMock = createChromeMock();
    vi.stubGlobal("chrome", chromeMock);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        return url.includes(":generateContent")
          ? new Response("{}", { status: 401 })
          : url.includes("/oauth2/v2/userinfo")
            ? userInfoResponse()
            : modelsResponse();
      }),
    );

    const { result } = renderHook(() => useGoogleAuth());
    await waitFor(() => expect(result.current.state.status).toBe("ready"));

    let caught: unknown;
    await act(async () => {
      try {
        await result.current.generateContent(prompt);
      } catch (error) {
        caught = error;
      }
    });

    expect(caught).toMatchObject({ code: "TOKEN_EXPIRED" } satisfies Partial<GeminiAccessError>);
    await waitFor(() => expect(result.current.state.status).toBe("expired"));
    expect(chromeMock.identity.removeCachedAuthToken).toHaveBeenCalledWith({
      token: "test-google-access-token",
    });
  });

  it("keeps cached learning content accessible after a generation quota error", async () => {
    vi.stubGlobal("chrome", createChromeMock());
    let generationCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes(":generateContent")) {
          generationCalls += 1;
          return new Response("{}", { status: 429 });
        }
        return url.includes("/oauth2/v2/userinfo") ? userInfoResponse() : modelsResponse();
      }),
    );

    const { result } = renderHook(() => useGoogleAuth());
    await waitFor(() => expect(result.current.state.status).toBe("ready"));

    let caught: unknown;
    await act(async () => {
      try {
        await result.current.generateContent(prompt, { maxRetries: 3 });
      } catch (error) {
        caught = error;
      }
    });

    expect(caught).toMatchObject({ code: "QUOTA_EXCEEDED" });
    expect(generationCalls).toBe(1);
    expect(result.current.state.status).toBe("ready");
  });

  it("cancels in-flight Gemini generation on sign-out", async () => {
    const chromeMock = createChromeMock();
    vi.stubGlobal("chrome", chromeMock);
    let generationStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      generationStarted = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (!url.includes(":generateContent")) {
          return Promise.resolve(
            url.includes("/oauth2/v2/userinfo") ? userInfoResponse() : modelsResponse(),
          );
        }
        generationStarted?.();
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "AbortError")),
            { once: true },
          );
        });
      }),
    );

    const { result } = renderHook(() => useGoogleAuth());
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    const generation = result.current.generateContent(prompt);
    const generationResult = expect(generation).rejects.toMatchObject({ code: "ABORTED" });
    await started;

    await act(async () => {
      await result.current.signOut();
    });

    await generationResult;
    expect(result.current.state.status).toBe("signed_out");
  });

  it("cancels a stale generation before starting the newest request", async () => {
    const chromeMock = createChromeMock();
    vi.stubGlobal("chrome", chromeMock);
    let generationCalls = 0;
    let firstGenerationStarted: (() => void) | undefined;
    const firstStarted = new Promise<void>((resolve) => {
      firstGenerationStarted = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (!url.includes(":generateContent")) {
          return Promise.resolve(
            url.includes("/oauth2/v2/userinfo") ? userInfoResponse() : modelsResponse(),
          );
        }
        generationCalls += 1;
        if (generationCalls > 1) {
          return Promise.resolve(contentResponse());
        }
        firstGenerationStarted?.();
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "AbortError")),
            { once: true },
          );
        });
      }),
    );

    const { result } = renderHook(() => useGoogleAuth());
    await waitFor(() => expect(result.current.state.status).toBe("ready"));

    const staleGeneration = result.current.generateContent(prompt);
    const staleResult = expect(staleGeneration).rejects.toMatchObject({ code: "ABORTED" });
    await firstStarted;

    let latestAnswer: unknown;
    await act(async () => {
      latestAnswer = await result.current.generateContent(prompt);
    });

    await staleResult;
    expect(latestAnswer).toEqual({ answer: "grounded" });
    expect(generationCalls).toBe(2);
  });
});
