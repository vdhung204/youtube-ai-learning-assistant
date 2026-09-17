import { useCallback, useEffect, useRef, useState } from "react";
import {
  getIndexStatus as requestIndexStatus,
  indexVideo as requestIndexVideo,
  LocalServiceError,
} from "../../integrations/local-service/client";
import { getActiveVideoTranscript } from "../../integrations/youtube/client";
import type {
  IndexRequest,
  IndexResponse,
  IndexStatusResponse,
  TranscriptSegment,
  Video,
} from "../../types/api";
import type { VideoMilestone } from "../../types/learning";
import { buildVideoMilestones } from "../videoPresentation";

export type RagServiceStatus =
  | "idle"
  | "checking"
  | "ready"
  | "not_ready"
  | "offline"
  | "error"
  | "unavailable";

export type VideoRagSessionStage = "transcript" | "index" | "poll";

interface SessionStateBase {
  message: string;
  videoId: string | null;
}

export type VideoRagSessionState =
  | (SessionStateBase & { status: "idle" | "waiting_for_service" })
  | (SessionStateBase & {
      status: "service_offline";
      retryable: true;
      serviceStatus: Exclude<RagServiceStatus, "ready" | "checking" | "idle"> | "unknown";
    })
  | (SessionStateBase & { status: "loading_transcript" })
  | (SessionStateBase & {
      status: "no_transcript";
      errorCode: "NO_TRANSCRIPT";
      retryable: false;
    })
  | (SessionStateBase & {
      status: "indexing";
      cached: false;
      chunkCount: number;
      pipelineVersion: string;
      pollAttempt: number;
      segmentCount: number;
    })
  | (SessionStateBase & {
      status: "ready";
      cacheSource: "backend" | "memory" | "none";
      cached: boolean;
      chunkCount: number;
      language: string;
      milestones: VideoMilestone[];
      pipelineVersion: string;
      segmentCount: number;
    })
  | (SessionStateBase & {
      status: "stale";
      errorCode: "STALE_VIDEO";
      retryable: true;
    })
  | (SessionStateBase & {
      status: "error";
      errorCode?: string;
      retryable: boolean;
      stage: VideoRagSessionStage;
    });

export interface VideoRagSessionDependencies {
  getTranscript: typeof getActiveVideoTranscript;
  getIndexStatus: typeof requestIndexStatus;
  indexVideo: typeof requestIndexVideo;
  sleep: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}

export interface RunVideoRagSessionOptions {
  dependencies?: Partial<VideoRagSessionDependencies>;
  maxPollAttempts?: number;
  onState?: (state: VideoRagSessionState) => void;
  pollIntervalMs?: number;
  signal: AbortSignal;
  video: Video;
}

export interface UseVideoRagSessionOptions {
  dependencies?: Partial<VideoRagSessionDependencies>;
  enabled?: boolean;
  maxPollAttempts?: number;
  pollIntervalMs?: number;
  serviceStatus: RagServiceStatus;
  video: Video | null | undefined;
}

export interface UseVideoRagSessionResult {
  cancel: () => void;
  isReady: boolean;
  retry: () => void;
  state: VideoRagSessionState;
}

const idleState: VideoRagSessionState = {
  message: "Chưa có video để chuẩn bị phiên RAG.",
  status: "idle",
  videoId: null,
};

const defaultDependencies: VideoRagSessionDependencies = {
  getIndexStatus: requestIndexStatus,
  getTranscript: getActiveVideoTranscript,
  indexVideo: requestIndexVideo,
  sleep: waitForDelay,
};

function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw abortError();
  }
}

function waitForDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(abortError());
  }

  return new Promise((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, milliseconds);
    const handleAbort = () => {
      globalThis.clearTimeout(timeout);
      reject(abortError());
    };
    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

function errorCode(error: unknown): string | undefined {
  if (error instanceof LocalServiceError) {
    return error.detail?.code;
  }
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function isAbort(error: unknown, signal: AbortSignal): boolean {
  return (
    signal.aborted ||
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function validateTranscript(
  durationSec: number,
  segments: readonly TranscriptSegment[],
): "NO_TRANSCRIPT" | "INVALID_TRANSCRIPT" | undefined {
  if (segments.length === 0) {
    return "NO_TRANSCRIPT";
  }

  let previousPosition = -1;
  let previousStart = -1;
  for (const segment of segments) {
    if (
      !segment.text.trim() ||
      !Number.isFinite(segment.startSec) ||
      !Number.isFinite(segment.endSec) ||
      !Number.isInteger(segment.position) ||
      segment.startSec < 0 ||
      segment.endSec < segment.startSec ||
      segment.endSec > durationSec ||
      segment.position <= previousPosition ||
      segment.startSec < previousStart
    ) {
      return "INVALID_TRANSCRIPT";
    }
    previousPosition = segment.position;
    previousStart = segment.startSec;
  }

  return undefined;
}

function normalizeTimestampRounding(
  segments: readonly TranscriptSegment[],
  durationSec: number,
): TranscriptSegment[] {
  return segments.map((segment) => {
    if (segment.endSec <= durationSec || segment.endSec - durationSec > 1) {
      return segment;
    }
    return {
      ...segment,
      endSec: durationSec,
      startSec: Math.min(segment.startSec, durationSec),
    };
  });
}

function failedState(
  error: unknown,
  videoId: string,
  stage: VideoRagSessionStage,
): VideoRagSessionState {
  const code = errorCode(error);
  if (code === "NO_TRANSCRIPT") {
    return {
      errorCode: "NO_TRANSCRIPT",
      message: "Video này không có phụ đề để lập chỉ mục.",
      retryable: false,
      status: "no_transcript",
      videoId,
    };
  }
  if (code === "STALE_VIDEO") {
    return {
      errorCode: "STALE_VIDEO",
      message: "Video đã thay đổi trong khi đang đọc phụ đề. Dữ liệu cũ đã bị bỏ qua.",
      retryable: true,
      status: "stale",
      videoId,
    };
  }
  if (
    (error instanceof LocalServiceError && error.kind === "network") ||
    code === "SERVICE_NOT_READY"
  ) {
    return {
      message: errorMessage(error, "Không kết nối được Local RAG Service."),
      retryable: true,
      serviceStatus: "unknown",
      status: "service_offline",
      videoId,
    };
  }

  const retryable =
    error instanceof LocalServiceError
      ? (error.detail?.retryable ?? error.kind !== "protocol")
      : typeof error === "object" && error !== null && "retryable" in error
        ? (error as { retryable: unknown }).retryable === true
        : code === "TRANSCRIPT_UNAVAILABLE" ||
          code === "NETWORK_ERROR" ||
          code === "INDEX_POLL_TIMEOUT";
  return {
    ...(code ? { errorCode: code } : {}),
    message: errorMessage(error, "Không thể chuẩn bị dữ liệu RAG cho video."),
    retryable,
    stage,
    status: "error",
    videoId,
  };
}

function transcriptFailure(code: "NO_TRANSCRIPT" | "INVALID_TRANSCRIPT"): Error & { code: string } {
  const error = new Error(
    code === "NO_TRANSCRIPT"
      ? "Video này không có phụ đề để lập chỉ mục."
      : "Phụ đề YouTube không hợp lệ hoặc timestamp nằm ngoài thời lượng video.",
  ) as Error & { code: string };
  error.code = code;
  return error;
}

function pollFailure(status: IndexStatusResponse): Error & { code: string; retryable: boolean } {
  const error = new Error(
    status.error?.message ??
      (status.indexStatus === "not_indexed"
        ? "Local RAG Service không tìm thấy chỉ mục vừa tạo."
        : "Local RAG Service không thể lập chỉ mục video."),
  ) as Error & { code: string; retryable: boolean };
  error.code = status.error?.code ?? (status.indexStatus === "not_indexed" ? "INDEX_NOT_FOUND" : "INDEX_FAILED");
  error.retryable = status.error?.retryable ?? true;
  return error;
}

function cacheSource(indexResponse: IndexResponse): "backend" | "none" {
  return indexResponse.cached ? "backend" : "none";
}

/**
 * Runs one transcript -> index -> status-poll operation. It never publishes a
 * state after its AbortSignal is cancelled, which makes it safe across YouTube
 * SPA navigation and React effect cleanup.
 */
export async function runVideoRagSession({
  dependencies: overrides,
  maxPollAttempts = 75,
  onState = () => undefined,
  pollIntervalMs = 800,
  signal,
  video,
}: RunVideoRagSessionOptions): Promise<VideoRagSessionState | null> {
  const dependencies: VideoRagSessionDependencies = { ...defaultDependencies, ...overrides };
  const publish = (state: VideoRagSessionState) => {
    if (!signal.aborted) {
      onState(state);
    }
    return state;
  };

  if (!Number.isInteger(maxPollAttempts) || maxPollAttempts < 1) {
    throw new TypeError("maxPollAttempts must be a positive integer.");
  }
  if (!Number.isFinite(pollIntervalMs) || pollIntervalMs < 0) {
    throw new TypeError("pollIntervalMs must be a non-negative number.");
  }

  let stage: VideoRagSessionStage = "transcript";
  try {
    if (!Number.isFinite(video.durationSec) || video.durationSec <= 0) {
      const invalidVideo = new Error(
        "YouTube chưa cung cấp thời lượng video. Hãy chờ trình phát tải xong rồi thử lại.",
      ) as Error & { code: string; retryable: boolean };
      invalidVideo.code = "INVALID_VIDEO_CONTEXT";
      invalidVideo.retryable = true;
      throw invalidVideo;
    }
    publish({
      message: "Đang tải phụ đề YouTube…",
      status: "loading_transcript",
      videoId: video.videoId,
    });
    const transcript = await dependencies.getTranscript();
    throwIfAborted(signal);

    if (transcript.videoId !== video.videoId) {
      const stale = new Error("Transcript thuộc về video khác.") as Error & { code: string };
      stale.code = "STALE_VIDEO";
      throw stale;
    }

    const transcriptSegments = normalizeTimestampRounding(transcript.segments, video.durationSec);
    const validationError = validateTranscript(video.durationSec, transcriptSegments);
    if (validationError) {
      throw transcriptFailure(validationError);
    }

    const language = transcript.language.trim() || video.language.trim() || "und";
    const milestones = buildVideoMilestones(transcript.chapters ?? []);
    const payload: IndexRequest = {
      transcriptSegments,
      video: {
        durationSec: video.durationSec,
        language,
        title: video.title,
        videoId: video.videoId,
      },
    };

    stage = "index";
    const indexed = await dependencies.indexVideo(video.videoId, payload, { signal });
    throwIfAborted(signal);

    if (indexed.indexStatus === "ready") {
      return publish({
        cached: indexed.cached,
        cacheSource: cacheSource(indexed),
        chunkCount: indexed.chunkCount ?? 0,
        language,
        message: indexed.cached
          ? "Đã dùng chỉ mục video có sẵn trong Local RAG Service."
          : "Video đã được lập chỉ mục.",
        milestones,
        pipelineVersion: indexed.pipelineVersion,
        segmentCount: transcriptSegments.length,
        status: "ready",
        videoId: video.videoId,
      });
    }

    stage = "poll";
    let latestChunkCount = indexed.chunkCount ?? 0;
    let latestPipelineVersion = indexed.pipelineVersion;
    for (let attempt = 1; attempt <= maxPollAttempts; attempt += 1) {
      publish({
        cached: false,
        chunkCount: latestChunkCount,
        message: "Đang lập chỉ mục phụ đề video…",
        pipelineVersion: latestPipelineVersion,
        pollAttempt: attempt,
        segmentCount: transcriptSegments.length,
        status: "indexing",
        videoId: video.videoId,
      });

      const status = await dependencies.getIndexStatus(video.videoId, { signal });
      throwIfAborted(signal);
      latestChunkCount = status.chunkCount;
      latestPipelineVersion = status.pipelineVersion;

      if (status.indexStatus === "ready") {
        return publish({
          cached: false,
          cacheSource: "none",
          chunkCount: status.chunkCount,
          language,
          message: "Video đã được lập chỉ mục và sẵn sàng để học.",
          milestones,
          pipelineVersion: status.pipelineVersion,
          segmentCount: transcriptSegments.length,
          status: "ready",
          videoId: video.videoId,
        });
      }
      if (status.indexStatus === "failed" || status.indexStatus === "not_indexed") {
        throw pollFailure(status);
      }
      if (attempt < maxPollAttempts) {
        await dependencies.sleep(pollIntervalMs, signal);
        throwIfAborted(signal);
      }
    }

    const timeout = new Error("Quá thời gian chờ Local RAG Service lập chỉ mục.") as Error & {
      code: string;
    };
    timeout.code = "INDEX_POLL_TIMEOUT";
    throw timeout;
  } catch (error) {
    if (isAbort(error, signal)) {
      return null;
    }
    return publish(failedState(error, video.videoId, stage));
  }
}

function videoCacheKey(video: Video): string {
  return JSON.stringify([video.videoId, video.title, video.durationSec, video.language]);
}

/** Keeps exactly one active RAG preparation request and ignores stale results. */
export function useVideoRagSession({
  dependencies,
  enabled = true,
  maxPollAttempts,
  pollIntervalMs,
  serviceStatus,
  video,
}: UseVideoRagSessionOptions): UseVideoRagSessionResult {
  const [state, setState] = useState<VideoRagSessionState>(idleState);
  const [retryVersion, setRetryVersion] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const readyCacheRef = useRef(new Map<string, Extract<VideoRagSessionState, { status: "ready" }>>());
  const sessionVideo = video
    ? {
        durationSec: video.durationSec,
        language: video.language,
        title: video.title,
        videoId: video.videoId,
      }
    : null;
  const videoId = sessionVideo?.videoId;
  const videoTitle = sessionVideo?.title;
  const videoDurationSec = sessionVideo?.durationSec;
  const videoLanguage = sessionVideo?.language;
  const getTranscriptDependency = dependencies?.getTranscript;
  const getIndexStatusDependency = dependencies?.getIndexStatus;
  const indexVideoDependency = dependencies?.indexVideo;
  const sleepDependency = dependencies?.sleep;

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    controllerRef.current?.abort();
    controllerRef.current = null;

    if (!enabled) {
      readyCacheRef.current.clear();
      setState(idleState);
      return;
    }
    if (!sessionVideo) {
      setState(idleState);
      return;
    }

    if (serviceStatus !== "ready") {
      if (!["checking", "idle"].includes(serviceStatus)) {
        readyCacheRef.current.clear();
      }
      if (serviceStatus === "checking" || serviceStatus === "idle") {
        setState({
          message: "Đang chờ Local RAG Service sẵn sàng…",
          status: "waiting_for_service",
          videoId: sessionVideo.videoId,
        });
      } else {
        setState({
          message:
            serviceStatus === "not_ready"
              ? "Local RAG Service đang chạy nhưng pipeline RAG chưa sẵn sàng."
              : "Không kết nối được Local RAG Service.",
          retryable: true,
          serviceStatus,
          status: "service_offline",
          videoId: sessionVideo.videoId,
        });
      }
      return;
    }

    const key = videoCacheKey(sessionVideo);
    const cached = readyCacheRef.current.get(key);
    if (cached) {
      setState({
        ...cached,
        cached: true,
        cacheSource: "memory",
        message: "Đã khôi phục phiên RAG sẵn sàng cho video này.",
      });
      return;
    }

    const controller = new AbortController();
    controllerRef.current = controller;
    void runVideoRagSession({
      dependencies: {
        ...(getTranscriptDependency ? { getTranscript: getTranscriptDependency } : {}),
        ...(getIndexStatusDependency ? { getIndexStatus: getIndexStatusDependency } : {}),
        ...(indexVideoDependency ? { indexVideo: indexVideoDependency } : {}),
        ...(sleepDependency ? { sleep: sleepDependency } : {}),
      },
      ...(maxPollAttempts === undefined ? {} : { maxPollAttempts }),
      onState: (nextState) => {
        if (requestId !== requestIdRef.current || controller.signal.aborted) {
          return;
        }
        if (nextState.status === "ready") {
          readyCacheRef.current.set(key, nextState);
        } else if (nextState.status === "service_offline") {
          readyCacheRef.current.clear();
        }
        setState(nextState);
      },
      ...(pollIntervalMs === undefined ? {} : { pollIntervalMs }),
      signal: controller.signal,
      video: sessionVideo,
    });

    return () => {
      controller.abort();
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    };
  }, [
    enabled,
    getIndexStatusDependency,
    getTranscriptDependency,
    indexVideoDependency,
    maxPollAttempts,
    pollIntervalMs,
    retryVersion,
    serviceStatus,
    sleepDependency,
    videoDurationSec,
    videoId,
    videoLanguage,
    videoTitle,
  ]);

  const retry = useCallback(() => {
    if (sessionVideo) {
      readyCacheRef.current.delete(videoCacheKey(sessionVideo));
    }
    setRetryVersion((version) => version + 1);
  }, [videoDurationSec, videoId, videoLanguage, videoTitle]);

  const cancel = useCallback(() => {
    requestIdRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    setState({
      message: "Đã hủy chuẩn bị phiên RAG.",
      status: "idle",
      videoId: videoId ?? null,
    });
  }, [videoId]);

  return {
    cancel,
    isReady: state.status === "ready" && state.videoId === videoId,
    retry,
    state,
  };
}
