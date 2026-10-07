import type { GatewayConfig } from "./config.ts";
import type { GenerateRequest, GeneratedData } from "./contracts.ts";
import { GatewayError } from "./errors.ts";
import { isRecord } from "./input-validation.ts";
import { validateGeneratedOutput } from "./output-validation.ts";
import { responseSchema, systemInstruction, userContent } from "./prompts.ts";
import { readProviderDiagnostics, type ProviderDiagnostics } from "./provider-diagnostics.ts";

const GEMINI_INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const MAX_PROVIDER_RESPONSE_BYTES = 512 * 1024;
const MAX_RETRY_DELAY_MS = 4_000;

export interface GeminiDependencies {
  fetchImpl?: typeof fetch;
  onMetric?: (metric: GeminiMetric) => void;
  random?: () => number;
  sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}

export interface GeminiMetric {
  attempt: number;
  durationMs: number;
  outcome: "error" | "ok";
  providerStatus?: number;
  model?: string;
  providerDiagnostics?: ProviderDiagnostics;
  stage: "provider_fetch" | "provider_response_read" | "provider_parse_validate" | "provider_error";
}

function emitMetric(
  dependencies: GeminiDependencies,
  metric: GeminiMetric,
): void {
  dependencies.onMetric?.(metric);
}

function maxOutputTokens(request: GenerateRequest): number {
  switch (request.task) {
    case "questions":
      return Math.max(3_072, request.requestedCount * 512 + 512);
    case "flashcards":
      return Math.max(2_048, request.requestedCount * 320 + 512);
    case "answers":
      return 3_072;
    case "feedback":
      return 2_048;
  }
}

export function buildGeminiRequestBody(
  request: GenerateRequest,
  config: Pick<GatewayConfig, "geminiModel">,
): Record<string, unknown> {
  return {
    model: config.geminiModel,
    input: userContent(request),
    system_instruction: systemInstruction(request),
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: responseSchema(request),
    },
    generation_config: {
      max_output_tokens: maxOutputTokens(request),
      thinking_level: "low",
    },
    background: false,
    store: false,
    stream: false,
  };
}

function providerHttpError(
  response: Response,
  diagnostics: ProviderDiagnostics & { model: string; attempt: number },
): never {
  const options = {
    providerDiagnostics: diagnostics,
    ...(diagnostics.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: diagnostics.retryAfterSeconds }),
  };
  if (response.status === 401 || response.status === 403) {
    throw new GatewayError("UPSTREAM_AUTH_ERROR", 503, false, options);
  }
  if (response.status === 429) {
    throw new GatewayError("UPSTREAM_RATE_LIMITED", 429, true, options);
  }
  if (response.status === 408 || response.status >= 500) {
    throw new GatewayError("UPSTREAM_UNAVAILABLE", 503, true, options);
  }
  throw new GatewayError("UPSTREAM_REJECTED", 502, false, options);
}

async function readJson(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PROVIDER_RESPONSE_BYTES) {
    throw new GatewayError("UPSTREAM_INVALID_RESPONSE", 502, true);
  }
  let text: string;
  try {
    text = await response.text();
  } catch (error) {
    throw new GatewayError("UPSTREAM_INVALID_RESPONSE", 502, true, { cause: error });
  }
  if (!text || new TextEncoder().encode(text).byteLength > MAX_PROVIDER_RESPONSE_BYTES) {
    throw new GatewayError("UPSTREAM_INVALID_RESPONSE", 502, true);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new GatewayError("UPSTREAM_INVALID_RESPONSE", 502, true, { cause: error });
  }
}

function textFromInteraction(body: unknown): string {
  if (!isRecord(body)) {
    throw new GatewayError("UPSTREAM_INVALID_RESPONSE", 502, true);
  }
  if (body.status === "incomplete") {
    throw new GatewayError("UPSTREAM_INVALID_RESPONSE", 502, true);
  }
  if (body.status === "failed" || body.status === "cancelled") {
    throw new GatewayError("UPSTREAM_UNAVAILABLE", 503, true);
  }
  if (typeof body.output_text === "string" && body.output_text.trim()) {
    return body.output_text.trim();
  }
  if (!Array.isArray(body.steps)) {
    throw new GatewayError("UPSTREAM_INVALID_RESPONSE", 502, true);
  }
  const texts = body.steps.flatMap((step) => {
    if (!isRecord(step) || step.type !== "model_output" || !Array.isArray(step.content)) {
      return [];
    }
    return step.content.flatMap((content) =>
      isRecord(content) && content.type === "text" && typeof content.text === "string"
        ? [content.text]
        : []);
  });
  const result = texts.join("").trim();
  if (!result) {
    throw new GatewayError("UPSTREAM_INVALID_RESPONSE", 502, true);
  }
  return result;
}

function parseGeneratedJson(text: string): unknown {
  if (text.length > MAX_PROVIDER_RESPONSE_BYTES) {
    throw new GatewayError("UPSTREAM_INVALID_RESPONSE", 502, true);
  }
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/iu.exec(text);
  try {
    return JSON.parse(fenced?.[1] ?? text) as unknown;
  } catch (error) {
    throw new GatewayError("UPSTREAM_INVALID_RESPONSE", 502, true, { cause: error });
  }
}

async function generateOnce(
  request: GenerateRequest,
  config: GatewayConfig,
  signal: AbortSignal,
  attempt: number,
  dependencies: GeminiDependencies,
): Promise<GeneratedData> {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  let response: Response;
  const fetchStartedAt = Date.now();
  try {
    response = await fetchImpl(GEMINI_INTERACTIONS_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-goog-api-key": config.geminiApiKey,
      },
      body: JSON.stringify(buildGeminiRequestBody(request, config)),
      credentials: "omit",
      signal,
    });
  } catch (error) {
    emitMetric(dependencies, {
      attempt,
      durationMs: Date.now() - fetchStartedAt,
      outcome: "error",
      stage: "provider_fetch",
    });
    if (signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      throw new GatewayError("REQUEST_TIMEOUT", 504, true, { cause: error });
    }
    throw new GatewayError("UPSTREAM_UNAVAILABLE", 503, true, { cause: error });
  }
  emitMetric(dependencies, {
    attempt,
    durationMs: Date.now() - fetchStartedAt,
    outcome: response.ok ? "ok" : "error",
    providerStatus: response.status,
    stage: "provider_fetch",
  });
  if (!response.ok) {
    const diagnostics = await readProviderDiagnostics(response, signal);
    emitMetric(dependencies, {
      attempt,
      model: config.geminiModel,
      durationMs: Date.now() - fetchStartedAt,
      outcome: "error",
      providerStatus: response.status,
      providerDiagnostics: diagnostics,
      stage: "provider_error",
    });
    providerHttpError(response, { ...diagnostics, model: config.geminiModel, attempt });
  }

  const readStartedAt = Date.now();
  let body: unknown;
  try {
    body = await readJson(response);
  } catch (error) {
    emitMetric(dependencies, {
      attempt,
      durationMs: Date.now() - readStartedAt,
      outcome: "error",
      providerStatus: response.status,
      stage: "provider_response_read",
    });
    throw error;
  }
  emitMetric(dependencies, {
    attempt,
    durationMs: Date.now() - readStartedAt,
    outcome: "ok",
    providerStatus: response.status,
    stage: "provider_response_read",
  });

  const validationStartedAt = Date.now();
  try {
    const generated = parseGeneratedJson(textFromInteraction(body));
    const result = validateGeneratedOutput(generated, request);
    emitMetric(dependencies, {
      attempt,
      durationMs: Date.now() - validationStartedAt,
      outcome: "ok",
      providerStatus: response.status,
      stage: "provider_parse_validate",
    });
    return result;
  } catch (error) {
    emitMetric(dependencies, {
      attempt,
      durationMs: Date.now() - validationStartedAt,
      outcome: "error",
      providerStatus: response.status,
      stage: "provider_parse_validate",
    });
    throw error;
  }
}

function defaultSleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new GatewayError("REQUEST_TIMEOUT", 504, true));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new GatewayError("REQUEST_TIMEOUT", 504, true));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function retryDelay(error: GatewayError, attempt: number, random: () => number): number | undefined {
  if (error.retryAfterSeconds !== undefined) {
    const requestedDelay = error.retryAfterSeconds * 1_000;
    // A long provider backoff cannot fit safely inside the Vercel function
    // deadline. Return the error (and Retry-After header) to the caller instead
    // of sleeping briefly and immediately hitting the overloaded model again.
    return requestedDelay <= MAX_RETRY_DELAY_MS ? requestedDelay : undefined;
  }
  const base = Math.min(400 * (2 ** attempt), MAX_RETRY_DELAY_MS);
  return Math.round(base * (0.75 + random() * 0.5));
}

export async function generateWithGemini(
  request: GenerateRequest,
  config: GatewayConfig,
  signal: AbortSignal,
  dependencies: GeminiDependencies = {},
): Promise<GeneratedData> {
  const random = dependencies.random ?? Math.random;
  const sleep = dependencies.sleep ?? defaultSleep;
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await generateOnce(request, config, signal, attempt + 1, dependencies);
    } catch (error) {
      if (
        !(error instanceof GatewayError) ||
        !error.retryable ||
        error.code === "REQUEST_TIMEOUT" ||
        attempt >= config.geminiMaxRetries
      ) {
        throw error;
      }
      const delay = retryDelay(error, attempt, random);
      if (delay === undefined) {
        throw error;
      }
      await sleep(delay, signal);
    }
  }
}
