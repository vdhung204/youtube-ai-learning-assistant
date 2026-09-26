import { GeminiAccessError } from "./errors";
import { isRecord } from "./validation";

export const GEMINI_API_ORIGIN = "https://generativelanguage.googleapis.com";
export const DEFAULT_MAX_RETRIES = 1;
const MAX_RETRY_DELAY_MS = 8_000;

function abortError(): GeminiAccessError {
  return new GeminiAccessError("ABORTED", "Yêu cầu Gemini đã bị hủy.", undefined, {
    retryable: false,
  });
}

function isAbort(error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true || (error instanceof DOMException && error.name === "AbortError");
}

export function makeHeaders(token: string, projectId?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  };
  const normalizedProjectId = projectId?.trim();
  if (normalizedProjectId) {
    headers["x-goog-user-project"] = normalizedProjectId;
  }
  return headers;
}

function retryAfterMs(response: Response): number | undefined {
  const value = response.headers.get("retry-after")?.trim();
  if (!value) {
    return undefined;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1_000);
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return undefined;
  }
  return Math.max(0, timestamp - Date.now());
}

async function googleErrorMessage(response: Response): Promise<string | undefined> {
  try {
    const body: unknown = await response.clone().json();
    if (!isRecord(body) || !isRecord(body.error) || typeof body.error.message !== "string") {
      return undefined;
    }
    const message = body.error.message
      .replace(/[\u0000-\u001F\u007F]+/gu, " ")
      .replace(/\s+/gu, " ")
      .trim();
    return message ? message.slice(0, 400) : undefined;
  } catch {
    return undefined;
  }
}

async function throwHttpError(response: Response): Promise<never> {
  if (response.status === 401) {
    throw new GeminiAccessError("TOKEN_EXPIRED", "Phiên Google đã hết hạn.", 401);
  }
  if (response.status === 403) {
    throw new GeminiAccessError(
      "PERMISSION_DENIED",
      "Tài khoản hoặc Google Cloud project chưa có quyền sử dụng Gemini.",
      403,
    );
  }
  if (response.status === 429) {
    throw new GeminiAccessError(
      "QUOTA_EXCEEDED",
      "Gemini đã hết quota tạm thời. Hãy thử lại sau.",
      429,
      { retryAfterMs: retryAfterMs(response) },
    );
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    const detail = await googleErrorMessage(response);
    throw new GeminiAccessError(
      "BAD_REQUEST",
      detail
        ? `Gemini từ chối yêu cầu. Chi tiết Google: ${detail}`
        : "Gemini từ chối cấu hình model, prompt hoặc response schema.",
      response.status,
      { retryable: false },
    );
  }
  throw new GeminiAccessError(
    "UNAVAILABLE",
    "Gemini đang không khả dụng. Hãy thử lại sau.",
    response.status,
    { retryAfterMs: retryAfterMs(response) },
  );
}

export async function fetchGeminiOnce(input: string, init: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch (error) {
    if (isAbort(error, init.signal ?? undefined)) {
      throw abortError();
    }
    throw new GeminiAccessError(
      "UNAVAILABLE",
      "Không thể kết nối tới Gemini. Hãy kiểm tra mạng rồi thử lại.",
    );
  }
  if (!response.ok) {
    await throwHttpError(response);
  }
  return response;
}

function retryDelay(error: GeminiAccessError, retryIndex: number): number {
  if (error.retryAfterMs !== undefined) {
    return Math.min(error.retryAfterMs, MAX_RETRY_DELAY_MS);
  }
  const exponential = Math.min(1_000 * (2 ** retryIndex), MAX_RETRY_DELAY_MS);
  return Math.round(exponential * (0.75 + Math.random() * 0.5));
}

async function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    throw abortError();
  }
  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, delayMs);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

export async function withTransientRetries<T>(
  operation: (attempt: number) => Promise<T>,
  signal: AbortSignal | undefined,
  maxRetries = DEFAULT_MAX_RETRIES,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (
        !(error instanceof GeminiAccessError) ||
        !error.retryable ||
        error.code === "QUOTA_EXCEEDED" ||
        error.code === "OUTPUT_TRUNCATED" ||
        attempt >= maxRetries
      ) {
        throw error;
      }
      await waitForRetry(retryDelay(error, attempt), signal);
    }
  }
}

export async function fetchGemini(
  input: string,
  init: RequestInit,
  maxRetries = DEFAULT_MAX_RETRIES,
): Promise<Response> {
  return withTransientRetries(
    () => fetchGeminiOnce(input, init),
    init.signal ?? undefined,
    maxRetries,
  );
}

export async function readJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new GeminiAccessError(
      "INVALID_RESPONSE",
      "Gemini trả về dữ liệu không hợp lệ.",
      response.status,
      { retryable: true },
    );
  }
}
