export type GeminiAccessErrorCode =
  | "TOKEN_EXPIRED"
  | "PERMISSION_DENIED"
  | "QUOTA_EXCEEDED"
  | "BAD_REQUEST"
  | "CONTENT_BLOCKED"
  | "OUTPUT_TRUNCATED"
  | "UNAVAILABLE"
  | "INVALID_RESPONSE"
  | "ABORTED";

export class GeminiAccessError extends Error {
  readonly code: GeminiAccessErrorCode;
  readonly retryable: boolean;
  readonly status?: number;
  readonly retryAfterMs?: number;

  constructor(
    code: GeminiAccessErrorCode,
    message: string,
    status?: number,
    options: { retryable?: boolean; retryAfterMs?: number } = {},
  ) {
    super(message);
    this.name = "GeminiAccessError";
    this.code = code;
    this.status = status;
    this.retryable = options.retryable ?? ["QUOTA_EXCEEDED", "UNAVAILABLE"].includes(code);
    this.retryAfterMs = options.retryAfterMs;
  }
}

export interface GeminiPromptInput {
  systemInstruction: string;
  userContent: string;
  responseSchema: Record<string, unknown>;
}

export type GeminiResponseValidator<T> = (response: unknown) => T;

export interface GeminiGenerateOptions<T = unknown> {
  maxOutputTokens?: number;
  model?: string;
  projectId?: string;
  signal?: AbortSignal;
  temperature?: number;
  validate?: GeminiResponseValidator<T>;
}

interface GeminiModelOptions {
  preferredModel?: string;
  projectId?: string;
  signal?: AbortSignal;
}

const GEMINI_API_ORIGIN = "https://generativelanguage.googleapis.com";
const GEMINI_MODELS_URL = `${GEMINI_API_ORIGIN}/v1beta/models?pageSize=50`;
const MODEL_NAME_PATTERN = /^(?:models\/)?[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const MAX_PROMPT_BYTES = 100_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function abortError(): GeminiAccessError {
  return new GeminiAccessError("ABORTED", "Yêu cầu Gemini đã bị hủy.", undefined, {
    retryable: false,
  });
}

function isAbort(error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true || (error instanceof DOMException && error.name === "AbortError");
}

function makeHeaders(token: string, projectId?: string): Record<string, string> {
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
  );
}

async function fetchGemini(input: string, init: RequestInit): Promise<Response> {
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

/** Keep provider-only schema fields limited to Gemini's supported subset. */
function toGeminiResponseSchema(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(toGeminiResponseSchema);
  }
  if (!isRecord(value)) {
    return value;
  }
  const supportedKeys = new Set([
    "type",
    "format",
    "nullable",
    "enum",
    "items",
    "properties",
    "required",
    "anyOf",
    "propertyOrdering",
    "additionalProperties",
    "minimum",
    "maximum",
    "minItems",
    "maxItems",
    "prefixItems",
    "title",
    "description",
  ]);
  const properties = isRecord(value.properties)
    ? Object.fromEntries(
        Object.entries(value.properties).map(([key, child]) => [key, toGeminiResponseSchema(child)]),
      )
    : undefined;
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, child]) =>
      key === "properties"
        ? properties === undefined ? [] : [[key, properties]]
        : supportedKeys.has(key) ? [[key, toGeminiResponseSchema(child)]] : [],
    ),
  );
}

async function readJsonResponse(response: Response): Promise<unknown> {
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

function supportedModelNames(body: unknown): string[] {
  if (!isRecord(body) || !Array.isArray(body.models)) {
    return [];
  }
  return body.models.flatMap((model) => {
    if (
      !isRecord(model) ||
      typeof model.name !== "string" ||
      !Array.isArray(model.supportedGenerationMethods) ||
      !model.supportedGenerationMethods.includes("generateContent")
    ) {
      return [];
    }
    return [model.name];
  });
}

function normalizeModelName(model: string): string {
  const normalized = model.trim();
  if (!MODEL_NAME_PATTERN.test(normalized)) {
    throw new GeminiAccessError(
      "BAD_REQUEST",
      "Tên model Gemini không hợp lệ.",
      undefined,
      { retryable: false },
    );
  }
  return normalized.startsWith("models/") ? normalized : `models/${normalized}`;
}

/** Resolve a generateContent-capable model with the authenticated Models API. */
export async function resolveGeminiModel(
  token: string,
  options: GeminiModelOptions = {},
): Promise<string> {
  const response = await fetchGemini(GEMINI_MODELS_URL, {
    credentials: "omit",
    headers: makeHeaders(token, options.projectId),
    method: "GET",
    signal: options.signal,
  });
  const models = supportedModelNames(await readJsonResponse(response));
  const preferredModel = options.preferredModel
    ? normalizeModelName(options.preferredModel)
    : undefined;
  if (preferredModel && models.includes(preferredModel)) {
    return preferredModel;
  }
  if (preferredModel) {
    throw new GeminiAccessError(
      "PERMISSION_DENIED",
      "Model Gemini đã cấu hình không khả dụng cho tài khoản này.",
      response.status,
      { retryable: false },
    );
  }
  const model = models.find((name) => /(?:^|-)flash(?:-|$)/iu.test(name)) ?? models[0];
  if (!model) {
    throw new GeminiAccessError(
      "PERMISSION_DENIED",
      "Không tìm thấy model Gemini hỗ trợ tạo nội dung cho tài khoản này.",
      response.status,
      { retryable: false },
    );
  }
  return normalizeModelName(model);
}

function promptByteLength(prompt: GeminiPromptInput): number {
  return new TextEncoder().encode(
    `${prompt.systemInstruction}\n${prompt.userContent}\n${JSON.stringify(prompt.responseSchema)}`,
  ).length;
}

function assertPrompt(prompt: GeminiPromptInput): void {
  if (
    !isRecord(prompt) ||
    typeof prompt.systemInstruction !== "string" ||
    !prompt.systemInstruction.trim() ||
    typeof prompt.userContent !== "string" ||
    !prompt.userContent.trim() ||
    !isRecord(prompt.responseSchema) ||
    promptByteLength(prompt) > MAX_PROMPT_BYTES
  ) {
    throw new GeminiAccessError(
      "BAD_REQUEST",
      "Prompt Gemini hoặc response schema không hợp lệ.",
      undefined,
      { retryable: false },
    );
  }
}

function generationText(body: unknown, status: number): string {
  if (!isRecord(body)) {
    throw new GeminiAccessError(
      "INVALID_RESPONSE",
      "Gemini trả về dữ liệu không hợp lệ.",
      status,
      { retryable: true },
    );
  }
  const promptFeedback = body.promptFeedback;
  if (
    isRecord(promptFeedback) &&
    typeof promptFeedback.blockReason === "string" &&
    promptFeedback.blockReason !== "BLOCK_REASON_UNSPECIFIED"
  ) {
    throw new GeminiAccessError(
      "CONTENT_BLOCKED",
      "Gemini đã chặn prompt theo chính sách an toàn.",
      status,
      { retryable: false },
    );
  }
  if (!Array.isArray(body.candidates) || body.candidates.length === 0) {
    throw new GeminiAccessError(
      "INVALID_RESPONSE",
      "Gemini không trả về nội dung.",
      status,
      { retryable: true },
    );
  }

  const candidate = body.candidates[0];
  if (!isRecord(candidate)) {
    throw new GeminiAccessError(
      "INVALID_RESPONSE",
      "Gemini trả về dữ liệu không hợp lệ.",
      status,
      { retryable: true },
    );
  }
  const finishReason = candidate.finishReason;
  if (finishReason === "MAX_TOKENS") {
    throw new GeminiAccessError(
      "OUTPUT_TRUNCATED",
      "Phản hồi Gemini bị cắt do vượt giới hạn độ dài.",
      status,
      { retryable: true },
    );
  }
  if (
    typeof finishReason === "string" &&
    ["SAFETY", "BLOCKLIST", "PROHIBITED_CONTENT", "RECITATION", "SPII"].includes(finishReason)
  ) {
    throw new GeminiAccessError(
      "CONTENT_BLOCKED",
      "Gemini đã chặn nội dung theo chính sách an toàn.",
      status,
      { retryable: false },
    );
  }
  const content = candidate.content;
  if (!isRecord(content) || !Array.isArray(content.parts)) {
    throw new GeminiAccessError(
      "INVALID_RESPONSE",
      "Gemini không trả về nội dung JSON.",
      status,
      { retryable: true },
    );
  }
  const text = content.parts
    .flatMap((part) =>
      isRecord(part) && part.thought !== true && typeof part.text === "string"
        ? [part.text]
        : [],
    )
    .join("")
    .trim();
  if (!text) {
    throw new GeminiAccessError(
      "INVALID_RESPONSE",
      "Gemini không trả về nội dung JSON.",
      status,
      { retryable: true },
    );
  }
  return text;
}

function parseGeneratedJson(text: string, status: number): unknown {
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/iu.exec(text);
  const json = fenced?.[1] ?? text;
  try {
    return JSON.parse(json);
  } catch {
    throw new GeminiAccessError(
      "INVALID_RESPONSE",
      "Gemini trả về JSON không hợp lệ.",
      status,
      { retryable: true },
    );
  }
}

/**
 * Calls Gemini directly from the extension. `token` is used only as the Google
 * Authorization header and must never be forwarded to the Local RAG Service.
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
  const model = normalizeModelName(options.model ?? "gemini-3.6-flash");
  const temperature = options.temperature ?? 0.2;
  const maxOutputTokens = options.maxOutputTokens ?? 4_096;
  if (
    !Number.isFinite(temperature) ||
    temperature < 0 ||
    temperature > 2 ||
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

  const url = `${GEMINI_API_ORIGIN}/v1beta/${encodeURI(model)}:generateContent`;
  const init = (includeSchema: boolean): RequestInit => ({
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
  });

  let response: Response;
  try {
    response = await fetchGemini(url, init(true));
  } catch (error) {
    // Some Gemini deployments reject structured schema fields even though JSON
    // mode itself works. Retry once with the same schema in the trusted system
    // instruction; the application still validates the returned JSON locally.
    if (!(error instanceof GeminiAccessError) || error.code !== "BAD_REQUEST" || error.status !== 400) {
      throw error;
    }
    response = await fetchGemini(url, init(false));
  }
  const parsed = parseGeneratedJson(
    generationText(await readJsonResponse(response), response.status),
    response.status,
  );
  return options.validate ? options.validate(parsed) : (parsed as T);
}
