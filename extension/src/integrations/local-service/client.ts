import type {
  AssessmentRequest,
  AssessmentResponse,
  ErrorDetail,
  ErrorResponse,
  HealthResponse,
  IndexRequest,
  IndexResponse,
  IndexStatusResponse,
  LocalServiceErrorCode,
  RetrieveRequest,
  RetrieveResponse,
} from "../../types/api";
import { isValidVideoId } from "../youtube/parseVideoId";

export const LOCAL_SERVICE_BASE_URL = "http://127.0.0.1:8765/api/v1";

type LocalServiceErrorKind = "http" | "network" | "protocol";

export interface LocalServiceRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

type Validator<T> = (value: unknown) => value is T;

const LOCAL_SERVICE_ERROR_CODES: ReadonlySet<string> = new Set<LocalServiceErrorCode>([
  "INVALID_REQUEST",
  "INVALID_VIDEO_ID",
  "VIDEO_ID_MISMATCH",
  "PAYLOAD_TOO_LARGE",
  "TRANSCRIPT_INVALID",
  "QUERY_INVALID",
  "QUIZ_INVALID",
  "INDEX_NOT_FOUND",
  "INDEX_FAILED",
  "RETRIEVAL_FAILED",
  "ASSESSMENT_FAILED",
  "CACHE_DELETE_FAILED",
  "SERVICE_NOT_READY",
  "ORIGIN_NOT_ALLOWED",
  "CREDENTIALS_NOT_ALLOWED",
  "REQUEST_TIMEOUT",
  "NOT_FOUND",
  "METHOD_NOT_ALLOWED",
  "INTERNAL_ERROR",
]);

export class LocalServiceError extends Error {
  readonly detail?: ErrorDetail;
  readonly kind: LocalServiceErrorKind;
  readonly status?: number;

  constructor(
    kind: LocalServiceErrorKind,
    message: string,
    options: { detail?: ErrorDetail; status?: number } = {},
  ) {
    super(message);
    this.name = "LocalServiceError";
    this.kind = kind;
    this.detail = options.detail;
    this.status = options.status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isTimestamp(
  value: unknown,
): value is Record<string, unknown> & { startSec: number; endSec: number } {
  return (
    isRecord(value) &&
    isFiniteNumber(value.startSec) &&
    isFiniteNumber(value.endSec) &&
    value.startSec >= 0 &&
    value.endSec >= value.startSec
  );
}

function isErrorDetail(value: unknown): value is ErrorDetail {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    LOCAL_SERVICE_ERROR_CODES.has(value.code) &&
    typeof value.message === "string" &&
    typeof value.retryable === "boolean" &&
    value.details === null
  );
}

function isErrorResponse(value: unknown): value is ErrorResponse {
  return isRecord(value) && isErrorDetail(value.error);
}

function isHealthResponse(value: unknown): value is HealthResponse {
  return (
    isRecord(value) &&
    (value.status === "ready" || value.status === "not_ready") &&
    typeof value.serviceVersion === "string" &&
    typeof value.pipelineVersion === "string" &&
    typeof value.vectorStoreReady === "boolean" &&
    typeof value.embeddingModelReady === "boolean" &&
    (value.error === undefined || isErrorDetail(value.error))
  );
}

function isIndexResponse(value: unknown): value is IndexResponse {
  return (
    isRecord(value) &&
    typeof value.videoId === "string" &&
    (value.indexStatus === "ready" || value.indexStatus === "indexing") &&
    typeof value.cached === "boolean" &&
    value.cached === (value.indexStatus === "ready") &&
    typeof value.pipelineVersion === "string" &&
    (value.chunkCount === undefined || isNonNegativeInteger(value.chunkCount)) &&
    (!value.cached || value.chunkCount !== undefined)
  );
}

function isIndexStatusResponse(value: unknown): value is IndexStatusResponse {
  return (
    isRecord(value) &&
    typeof value.videoId === "string" &&
    ["not_indexed", "indexing", "ready", "failed"].includes(String(value.indexStatus)) &&
    isNonNegativeInteger(value.chunkCount) &&
    typeof value.pipelineVersion === "string" &&
    (value.error === undefined || isErrorDetail(value.error))
  );
}

function isRetrieveResponse(value: unknown): value is RetrieveResponse {
  return (
    isRecord(value) &&
    typeof value.videoId === "string" &&
    ["quiz", "flashcard", "review"].includes(String(value.purpose)) &&
    Array.isArray(value.chunks) &&
    value.chunks.every(
      (chunk) =>
        isTimestamp(chunk) &&
        typeof chunk.chunkId === "string" &&
        typeof chunk.videoId === "string" &&
        typeof chunk.text === "string" &&
        isFiniteNumber(chunk.score) &&
        isNonNegativeInteger(chunk.position),
    ) &&
    (value.reason === undefined || value.reason === "NO_RELEVANT_CONTEXT")
  );
}

function isAssessmentResponse(value: unknown): value is AssessmentResponse {
  return (
    isRecord(value) &&
    isFiniteNumber(value.score) &&
    value.score >= 0 &&
    value.score <= 100 &&
    isNonNegativeInteger(value.correctCount) &&
    isNonNegativeInteger(value.totalCount) &&
    value.correctCount <= value.totalCount &&
    Array.isArray(value.questionResults) &&
    value.questionResults.length === value.totalCount &&
    value.questionResults.every(
      (result) =>
        isRecord(result) &&
        typeof result.questionId === "string" &&
        typeof result.correct === "boolean" &&
        isNonNegativeInteger(result.correctAnswer) &&
        (result.selectedAnswer === null || isNonNegativeInteger(result.selectedAnswer)),
    ) &&
    isStringArray(value.strongTopics) &&
    isStringArray(value.weakTopics) &&
    Array.isArray(value.reviewTimestamps) &&
    value.reviewTimestamps.every(
      (timestamp) =>
        isTimestamp(timestamp) &&
        typeof timestamp.chunkId === "string" &&
        typeof timestamp.topic === "string" &&
        typeof timestamp.reason === "string",
    )
  );
}

function assertVideoId(videoId: string): void {
  if (!isValidVideoId(videoId)) {
    throw new LocalServiceError("protocol", "Video ID không hợp lệ.");
  }
}

function assertSameVideo<T extends { videoId: string }>(result: T, videoId: string): T {
  if (result.videoId !== videoId) {
    throw new LocalServiceError("protocol", "Response chứa dữ liệu của video khác.");
  }
  return result;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new LocalServiceError("protocol", "Local Service trả về JSON không hợp lệ.", {
      status: response.status,
    });
  }
}

async function requestJson<T>(
  path: string,
  init: RequestInit,
  validator: Validator<T>,
  acceptedStatuses: readonly number[],
  options: LocalServiceRequestOptions = {},
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? 35_000);
  const abortFromCaller = () => controller.abort();
  options.signal?.addEventListener("abort", abortFromCaller, { once: true });

  try {
    const response = await fetch(`${LOCAL_SERVICE_BASE_URL}${path}`, {
      ...init,
      credentials: "omit",
      headers: {
        Accept: "application/json",
        ...init.headers,
      },
      signal: controller.signal,
    });
    const body = await readJson(response);
    if (acceptedStatuses.includes(response.status) && validator(body)) {
      return body;
    }
    if (isErrorResponse(body)) {
      throw new LocalServiceError("http", body.error.message, {
        detail: body.error,
        status: response.status,
      });
    }
    throw new LocalServiceError("protocol", "Response không đúng Local Service contract.", {
      status: response.status,
    });
  } catch (error) {
    if (error instanceof LocalServiceError) {
      throw error;
    }
    if (options.signal?.aborted) {
      throw error;
    }
    if (timedOut) {
      throw new LocalServiceError("network", "Local Service không phản hồi trong thời gian cho phép.");
    }
    throw new LocalServiceError(
      "network",
      "Không kết nối được Local Service. Service có thể chưa chạy hoặc origin extension chưa được cho phép.",
    );
  } finally {
    globalThis.clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromCaller);
  }
}

function postJson<T>(
  path: string,
  payload: unknown,
  validator: Validator<T>,
  acceptedStatuses: readonly number[],
  options?: LocalServiceRequestOptions,
): Promise<T> {
  return requestJson(
    path,
    {
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
    validator,
    acceptedStatuses,
    options,
  );
}

export function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return requestJson("/health", { method: "GET" }, isHealthResponse, [200, 503], {
    signal,
    timeoutMs: 4_000,
  });
}

export async function indexVideo(
  videoId: string,
  payload: IndexRequest,
  options?: LocalServiceRequestOptions,
): Promise<IndexResponse> {
  assertVideoId(videoId);
  const result = await postJson(
    `/videos/${videoId}/index`,
    payload,
    isIndexResponse,
    [200, 202],
    options,
  );
  return assertSameVideo(result, videoId);
}

export async function getIndexStatus(
  videoId: string,
  options?: LocalServiceRequestOptions,
): Promise<IndexStatusResponse> {
  assertVideoId(videoId);
  const result = await requestJson(
    `/videos/${videoId}/index-status`,
    { method: "GET" },
    isIndexStatusResponse,
    [200],
    options,
  );
  return assertSameVideo(result, videoId);
}

export async function retrieve(
  videoId: string,
  payload: RetrieveRequest,
  options?: LocalServiceRequestOptions,
): Promise<RetrieveResponse> {
  assertVideoId(videoId);
  const result = await postJson(
    `/videos/${videoId}/retrieve`,
    payload,
    isRetrieveResponse,
    [200],
    options,
  );
  if (result.purpose !== payload.purpose || result.chunks.some((chunk) => chunk.videoId !== videoId)) {
    throw new LocalServiceError("protocol", "Response retrieval không đúng video hoặc mục đích.");
  }
  return assertSameVideo(result, videoId);
}

export function assessQuiz(
  videoId: string,
  payload: AssessmentRequest,
  options?: LocalServiceRequestOptions,
): Promise<AssessmentResponse> {
  assertVideoId(videoId);
  return postJson(`/videos/${videoId}/assessments/quiz`, payload, isAssessmentResponse, [200], options);
}
