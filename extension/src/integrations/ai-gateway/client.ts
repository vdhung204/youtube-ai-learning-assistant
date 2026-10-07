import type { GenerationRequest } from "../../ai-content/index.ts";
import { AIContentError } from "../../ai-content/index.ts";
import { AiGatewayError, type AiGatewayErrorCode } from "./errors";

// The gateway owns provider retries. Retrying 5xx responses here would multiply
// Gemini calls and make a single UI action wait through two retry loops.
const DEFAULT_MAX_RETRIES = 0;
const DEFAULT_TIMEOUT_MS = 35_000;
const MAX_GATEWAY_RESPONSE_BYTES = 1_000_000;
const MAX_GATEWAY_REQUEST_BYTES = 64_000;
const MAX_RETRY_DELAY_MS = 10_000;
const RETRYABLE_STATUS = new Set([502, 503, 504]);
const TEST_GATEWAY_ORIGIN = "https://gateway.test";

export interface AiGatewayGenerateOptions<T = unknown> {
  maxRetries?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
  validate?: (response: unknown) => T;
}

interface GatewayErrorPayload {
  code?: unknown;
  message?: unknown;
  retryable?: unknown;
}

interface GatewayEnvelope {
  data?: unknown;
  error?: GatewayErrorPayload;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function configuredGatewayOrigin(): string {
  const configured = import.meta.env.VITE_YALA_GATEWAY_URL?.trim();
  if (!configured && import.meta.env.MODE === "test") {
    return TEST_GATEWAY_ORIGIN;
  }
  if (!configured) {
    throw new AiGatewayError(
      "MISCONFIGURED",
      "AI Gateway chưa được cấu hình. Hãy cài bản extension đã được đóng gói đúng.",
    );
  }
  return configured;
}

export function resolveGatewayEndpoint(configuredUrl = configuredGatewayOrigin()): string {
  let url: URL;
  try {
    url = new URL(configuredUrl);
  } catch {
    throw new AiGatewayError("MISCONFIGURED", "Địa chỉ AI Gateway không hợp lệ.");
  }
  const localDevelopment =
    url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname);
  if ((url.protocol !== "https:" && !localDevelopment) || url.username || url.password) {
    throw new AiGatewayError(
      "MISCONFIGURED",
      "AI Gateway phải dùng HTTPS (chỉ localhost được phép dùng HTTP).",
    );
  }
  if (url.search || url.hash) {
    throw new AiGatewayError("MISCONFIGURED", "Địa chỉ AI Gateway không được chứa query hoặc fragment.");
  }
  const basePath = url.pathname.replace(/\/+$/u, "");
  url.pathname = basePath.endsWith("/api/generate")
    ? basePath
    : `${basePath}/api/generate`.replace(/\/{2,}/gu, "/");
  return url.toString();
}

function assertGenerationRequest(request: GenerationRequest): void {
  const allowedTasks = new Set(["answers", "feedback", "flashcards", "questions"]);
  if (!allowedTasks.has(request.task) || !/^[a-z]{2,3}(?:-[A-Za-z0-9]+)*$/u.test(request.language)) {
    throw new AiGatewayError("INVALID_REQUEST", "Yêu cầu tạo nội dung không hợp lệ.");
  }
  if (
    (request.task === "questions" || request.task === "flashcards") &&
    (!Number.isInteger(request.requestedCount) || request.requestedCount < 1 || request.requestedCount > 10)
  ) {
    throw new AiGatewayError("INVALID_REQUEST", "Số lượng nội dung yêu cầu không hợp lệ.");
  }
  if (request.task === "answers" && !request.question) {
    throw new AiGatewayError("INVALID_REQUEST", "Câu hỏi cho trợ lý AI không hợp lệ.");
  }
  if (request.task === "feedback" && !request.assessment) {
    throw new AiGatewayError("INVALID_REQUEST", "Dữ liệu đánh giá không hợp lệ.");
  }
}

function requestBody(request: GenerationRequest): string {
  assertGenerationRequest(request);
  // Rebuild the wire payload from an allowlist. A caller cannot smuggle model,
  // prompt, schema or credential fields through a widened runtime object.
  const context = {
    videoId: request.context.videoId,
    durationSec: request.context.durationSec,
    chunks: request.context.chunks.map((chunk) => ({
      chunkId: chunk.chunkId,
      videoId: chunk.videoId,
      text: chunk.text,
      position: chunk.position,
      score: chunk.score,
      startSec: chunk.startSec,
      endSec: chunk.endSec,
    })),
  };
  const base = {
    task: request.task,
    language: request.language,
    context,
  };
  let wireRequest: Record<string, unknown>;
  switch (request.task) {
    case "questions":
    case "flashcards":
      wireRequest = { ...base, requestedCount: request.requestedCount };
      break;
    case "answers":
      wireRequest = { ...base, question: request.question };
      break;
    case "feedback":
      wireRequest = { ...base, assessment: request.assessment };
      break;
  }
  const body = JSON.stringify(wireRequest);
  if (new TextEncoder().encode(body).length > MAX_GATEWAY_REQUEST_BYTES) {
    throw new AiGatewayError(
      "PAYLOAD_TOO_LARGE",
      "Ngữ cảnh video quá lớn để gửi tới AI Gateway.",
    );
  }
  return body;
}

function retryAfterMs(headers: Headers): number | undefined {
  const value = headers.get("Retry-After");
  if (!value) {
    return undefined;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1_000, Number.MAX_SAFE_INTEGER);
  }
  const date = Date.parse(value);
  if (!Number.isFinite(date)) {
    return undefined;
  }
  return Math.max(date - Date.now(), 0);
}

function publicMessage(code: AiGatewayErrorCode): string {
  switch (code) {
    case "CONTENT_BLOCKED":
      return "AI không thể xử lý nội dung này do chính sách an toàn.";
    case "INVALID_REQUEST":
      return "Yêu cầu tạo nội dung không hợp lệ.";
    case "PAYLOAD_TOO_LARGE":
      return "Ngữ cảnh video quá lớn để xử lý.";
    case "RATE_LIMITED":
      return "AI Gateway đang bận. Hãy thử lại sau ít phút.";
    case "TIMEOUT":
      return "AI Gateway phản hồi quá chậm. Hãy thử lại.";
    default:
      return "AI Gateway tạm thời không khả dụng. Hãy thử lại.";
  }
}

function mapServerCode(code: unknown, status: number): AiGatewayErrorCode {
  if (code === "CONTENT_BLOCKED") return "CONTENT_BLOCKED";
  if (code === "INVALID_REQUEST" || code === "VALIDATION_ERROR") return "INVALID_REQUEST";
  if (code === "PAYLOAD_TOO_LARGE" || status === 413) return "PAYLOAD_TOO_LARGE";
  if (code === "RATE_LIMITED" || code === "UPSTREAM_RATE_LIMITED" || status === 429) {
    return "RATE_LIMITED";
  }
  if (code === "TIMEOUT" || code === "REQUEST_TIMEOUT" || status === 408 || status === 504) {
    return "TIMEOUT";
  }
  return "SERVER_ERROR";
}

async function readEnvelope(response: Response): Promise<GatewayEnvelope> {
  const text = await response.text();
  if (new TextEncoder().encode(text).length > MAX_GATEWAY_RESPONSE_BYTES) {
    throw new AiGatewayError("INVALID_RESPONSE", "AI Gateway trả về dữ liệu quá lớn.", {
      retryable: true,
      status: response.status,
    });
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed)) {
      throw new Error("not an object");
    }
    return parsed;
  } catch (cause) {
    throw new AiGatewayError("INVALID_RESPONSE", "AI Gateway trả về dữ liệu không hợp lệ.", {
      cause,
      retryable: true,
      status: response.status,
    });
  }
}

function normalizedProviderResponse(task: GenerationRequest["task"], data: unknown): unknown {
  if (!isRecord(data) || !Array.isArray(data.items)) {
    throw new AiGatewayError("INVALID_RESPONSE", "AI Gateway trả về dữ liệu không hợp lệ.", {
      retryable: true,
    });
  }
  if (data.status !== "ok" && data.status !== "insufficient_context") {
    throw new AiGatewayError("INVALID_RESPONSE", "AI Gateway trả về trạng thái không hợp lệ.", {
      retryable: true,
    });
  }
  if (data.status === "insufficient_context" && data.items.length !== 0) {
    throw new AiGatewayError("INVALID_RESPONSE", "AI Gateway trả về kết quả không nhất quán.", {
      retryable: true,
    });
  }
  return { status: data.status, [task]: data.items };
}

async function fetchOnce(endpoint: string, body: string, options: AiGatewayGenerateOptions): Promise<GatewayEnvelope> {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort();
  if (options.signal?.aborted) {
    controller.abort();
  } else {
    options.signal?.addEventListener("abort", abortFromCaller, { once: true });
  }
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      body,
      cache: "no-store",
      credentials: "omit",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      method: "POST",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
    const envelope = await readEnvelope(response);
    if (!response.ok) {
      const code = mapServerCode(envelope.error?.code, response.status);
      throw new AiGatewayError(code, publicMessage(code), {
        retryAfterMs: retryAfterMs(response.headers),
        retryable:
          RETRYABLE_STATUS.has(response.status) || envelope.error?.retryable === true,
        status: response.status,
      });
    }
    return envelope;
  } catch (cause) {
    if (cause instanceof AiGatewayError) {
      throw cause;
    }
    if (options.signal?.aborted) {
      throw new AiGatewayError("ABORTED", "Yêu cầu AI đã bị hủy.", { cause });
    }
    if (timedOut) {
      throw new AiGatewayError("TIMEOUT", publicMessage("TIMEOUT"), {
        cause,
        retryable: true,
      });
    }
    throw new AiGatewayError(
      "NETWORK_ERROR",
      "Không thể kết nối tới AI Gateway. Hãy kiểm tra mạng rồi thử lại.",
      { cause, retryable: true },
    );
  } finally {
    window.clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromCaller);
  }
}

function retryable(error: unknown): boolean {
  return (
    (error instanceof AiGatewayError && error.retryable) ||
    (error instanceof AIContentError && error.retryable)
  );
}

function delayFor(error: unknown, retryIndex: number): number {
  if (error instanceof AiGatewayError && error.retryAfterMs !== undefined) {
    return error.retryAfterMs;
  }
  return Math.min(300 * 2 ** retryIndex + Math.floor(Math.random() * 150), MAX_RETRY_DELAY_MS);
}

async function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    throw new AiGatewayError("ABORTED", "Yêu cầu AI đã bị hủy.");
  }
  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      window.clearTimeout(timer);
      reject(new AiGatewayError("ABORTED", "Yêu cầu AI đã bị hủy."));
    };
    const timer = window.setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, delayMs);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

export async function generateContent<T = unknown>(
  request: GenerationRequest,
  options: AiGatewayGenerateOptions<T> = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 4) {
    throw new AiGatewayError("INVALID_REQUEST", "Cấu hình retry AI Gateway không hợp lệ.");
  }
  if (
    options.timeoutMs !== undefined &&
    (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1_000 || options.timeoutMs > 120_000)
  ) {
    throw new AiGatewayError("INVALID_REQUEST", "Cấu hình timeout AI Gateway không hợp lệ.");
  }

  const endpoint = resolveGatewayEndpoint();
  const body = requestBody(request);
  const deadline = Date.now() + (options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  for (let attempt = 0; ; attempt += 1) {
    try {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        throw new AiGatewayError("TIMEOUT", publicMessage("TIMEOUT"));
      }
      const envelope = await fetchOnce(endpoint, body, {
        ...options,
        timeoutMs: remainingMs,
      });
      const normalized = normalizedProviderResponse(request.task, envelope.data);
      return options.validate ? options.validate(normalized) : normalized as T;
    } catch (error) {
      if (attempt >= maxRetries || !retryable(error) || options.signal?.aborted) {
        throw error;
      }
      const retryDelay = delayFor(error, attempt);
      if (Date.now() + retryDelay >= deadline) {
        throw error;
      }
      await waitForRetry(retryDelay, options.signal);
    }
  }
}

export { AiGatewayError, type AiGatewayErrorCode } from "./errors";
