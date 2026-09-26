import { GeminiAccessError } from "./errors";
import { generationModels } from "./models";
import { parseGenerationResponse } from "./response";
import {
  DEFAULT_MAX_RETRIES,
  GEMINI_API_ORIGIN,
  fetchGeminiOnce,
  makeHeaders,
  withTransientRetries,
} from "./transport";
import type { GeminiGenerateOptions, GeminiPromptInput, GeminiThinkingLevel } from "./types";
import { assertPrompt, toGeminiResponseSchema } from "./validation";

// Keep the public import path stable for hooks, pipelines and existing callers.
export { GeminiAccessError, type GeminiAccessErrorCode } from "./errors";
export { resolveGeminiModel, resolveGeminiModels } from "./models";
export type {
  GeminiGenerateOptions,
  GeminiPromptInput,
  GeminiResponseValidator,
  GeminiThinkingLevel,
} from "./types";

interface GenerationSettings {
  maxRetries: number;
  maxOutputTokens: number;
  temperature: number;
  thinkingLevel?: GeminiThinkingLevel;
}

function generationSettings(
  options: Pick<GeminiGenerateOptions, keyof GenerationSettings>,
): GenerationSettings {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const temperature = options.temperature ?? 0.2;
  const maxOutputTokens = options.maxOutputTokens ?? 4_096;
  const thinkingLevel = options.thinkingLevel;
  if (
    !Number.isFinite(temperature) ||
    temperature < 0 ||
    temperature > 2 ||
    !Number.isInteger(maxRetries) ||
    maxRetries < 0 ||
    maxRetries > 5 ||
    (thinkingLevel !== undefined &&
      !["LOW", "MEDIUM", "HIGH"].includes(thinkingLevel)) ||
    !Number.isInteger(maxOutputTokens) ||
    maxOutputTokens < 1 ||
    maxOutputTokens > 65_536
  ) {
    throw new GeminiAccessError(
      "BAD_REQUEST",
      "Cấu hình sinh nội dung Gemini không hợp lệ.",
      undefined,
      { retryable: false },
    );
  }
  return { maxRetries, maxOutputTokens, temperature, thinkingLevel };
}

function generationRequest(
  token: string,
  prompt: GeminiPromptInput,
  settings: GenerationSettings,
  options: Pick<GeminiGenerateOptions, "projectId" | "signal">,
  includeSchema: boolean,
): RequestInit {
  const { maxOutputTokens, temperature, thinkingLevel } = settings;
  return {
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt.userContent }], role: "user" }],
      generationConfig: {
        candidateCount: 1,
        maxOutputTokens,
        responseMimeType: "application/json",
        ...(includeSchema
          ? { responseSchema: toGeminiResponseSchema(prompt.responseSchema) }
          : {}),
        temperature,
        ...(thinkingLevel ? { thinkingConfig: { thinkingLevel } } : {}),
      },
      systemInstruction: {
        parts: [{
          text: includeSchema
            ? prompt.systemInstruction
            : `${prompt.systemInstruction}\nOutput JSON schema: ${JSON.stringify(prompt.responseSchema)}`,
        }],
      },
    }),
    credentials: "omit",
    headers: {
      ...makeHeaders(token, options.projectId),
      "Content-Type": "application/json",
    },
    method: "POST",
    signal: options.signal,
  };
}

function isSchemaRejection(error: unknown): boolean {
  return (
    error instanceof GeminiAccessError &&
    error.code === "BAD_REQUEST" &&
    error.status === 400 &&
    /response\s*schema|responseSchema/iu.test(error.message)
  );
}

async function requestWithSchemaFallback(
  request: (includeSchema: boolean) => Promise<Response>,
): Promise<Response> {
  try {
    return await request(true);
  } catch (error) {
    if (!isSchemaRejection(error)) {
      throw error;
    }
    // Local validation still runs when schema support requires JSON-only mode.
    return request(false);
  }
}

/**
 * Calls Gemini directly from the extension. The OAuth token is sent only to
 * Google, never to the Local RAG Service.
 */
export async function generateContent<T = unknown>(
  token: string,
  prompt: GeminiPromptInput,
  options: GeminiGenerateOptions<T> = {},
): Promise<T> {
  if (!token) {
    throw new GeminiAccessError(
      "TOKEN_EXPIRED",
      "Bạn cần đăng nhập lại trước khi gọi Gemini.",
      401,
      { retryable: false },
    );
  }
  assertPrompt(prompt);
  const models = generationModels(options);
  const settings = generationSettings(options);
  const response = await requestWithSchemaFallback((includeSchema) => withTransientRetries(
    (attempt) => {
      const selectedModel = models[Math.min(attempt, models.length - 1)];
      const url = `${GEMINI_API_ORIGIN}/v1beta/${encodeURI(selectedModel)}:generateContent`;
      return fetchGeminiOnce(url, generationRequest(token, prompt, settings, options, includeSchema));
    },
    options.signal,
    settings.maxRetries,
  ));
  const parsed = await parseGenerationResponse(response);
  return options.validate ? options.validate(parsed) : (parsed as T);
}
