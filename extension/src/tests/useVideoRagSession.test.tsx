import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { IndexResponse, IndexStatusResponse, Video } from "../types/api";
import {
  runVideoRagSession,
  type VideoRagSessionDependencies,
  type VideoRagSessionState,
  useVideoRagSession,
} from "../sidebar/hooks/useVideoRagSession";

const videoA: Video = {
  durationSec: 120,
  language: "vi",
  title: "Video A",
  videoId: "aaaaaaaaaaa",
};

const transcriptA = {
  chapters: [
    { startSec: 0, title: "Giới thiệu" },
    { startSec: 5, title: "Khái niệm chính" },
  ],
  language: "vi",
  segments: [
    { endSec: 4, position: 0, startSec: 0, text: "Nội dung thứ nhất" },
    { endSec: 9, position: 1, startSec: 5, text: "Nội dung thứ hai" },
  ],
  videoId: videoA.videoId,
};

function indexResponse(overrides: Partial<IndexResponse> = {}): IndexResponse {
  return {
    cached: false,
    indexStatus: "indexing",
    pipelineVersion: "pipeline-v1",
    videoId: videoA.videoId,
    ...overrides,
  };
}

function statusResponse(overrides: Partial<IndexStatusResponse> = {}): IndexStatusResponse {
  return {
    chunkCount: 0,
    indexStatus: "indexing",
    pipelineVersion: "pipeline-v1",
    videoId: videoA.videoId,
    ...overrides,
  };
}

function dependencies(
  overrides: Partial<VideoRagSessionDependencies> = {},
): VideoRagSessionDependencies {
  return {
    getIndexStatus: vi.fn().mockResolvedValue(
      statusResponse({ chunkCount: 2, indexStatus: "ready" }),
    ),
    getTranscript: vi.fn().mockResolvedValue(transcriptA),
    indexVideo: vi.fn().mockResolvedValue(indexResponse()),
    sleep: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("runVideoRagSession", () => {
  it("indexes the active transcript and polls until the matching video is ready", async () => {
    const deps = dependencies();
    const states: VideoRagSessionState[] = [];

    const result = await runVideoRagSession({
      dependencies: deps,
      onState: (state) => states.push(state),
      pollIntervalMs: 0,
      signal: new AbortController().signal,
      video: videoA,
    });

    expect(deps.indexVideo).toHaveBeenCalledWith(
      videoA.videoId,
      {
        transcriptSegments: transcriptA.segments,
        video: videoA,
      },
      { signal: expect.any(AbortSignal) },
    );
    expect(deps.getIndexStatus).toHaveBeenCalledWith(videoA.videoId, {
      signal: expect.any(AbortSignal),
    });
    expect(states.map((state) => state.status)).toEqual([
      "loading_transcript",
      "indexing",
      "ready",
    ]);
    expect(result).toMatchObject({
      cached: false,
      chunkCount: 2,
      milestones: [
        { label: "Giới thiệu", startSec: 0 },
        { label: "Khái niệm chính", startSec: 5 },
      ],
      status: "ready",
      videoId: videoA.videoId,
    });
  });

  it("uses the backend cache without polling", async () => {
    const deps = dependencies({
      indexVideo: vi.fn().mockResolvedValue(
        indexResponse({ cached: true, chunkCount: 4, indexStatus: "ready" }),
      ),
    });

    const result = await runVideoRagSession({
      dependencies: deps,
      signal: new AbortController().signal,
      video: videoA,
    });

    expect(deps.getIndexStatus).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      cacheSource: "backend",
      cached: true,
      chunkCount: 4,
      status: "ready",
    });
  });

  it("returns no_transcript and never sends an empty transcript to the service", async () => {
    const deps = dependencies({
      getTranscript: vi.fn().mockResolvedValue({
        ...transcriptA,
        segments: [],
      }),
    });

    const result = await runVideoRagSession({
      dependencies: deps,
      signal: new AbortController().signal,
      video: videoA,
    });

    expect(deps.indexVideo).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      errorCode: "NO_TRANSCRIPT",
      retryable: false,
      status: "no_transcript",
    });
  });

  it("returns a controlled retryable error while YouTube duration is not available", async () => {
    const deps = dependencies();

    const result = await runVideoRagSession({
      dependencies: deps,
      signal: new AbortController().signal,
      video: { ...videoA, durationSec: 0 },
    });

    expect(deps.getTranscript).not.toHaveBeenCalled();
    expect(deps.indexVideo).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      errorCode: "INVALID_VIDEO_CONTEXT",
      retryable: true,
      stage: "transcript",
      status: "error",
    });
  });

  it("clamps sub-second caption rounding at the video boundary", async () => {
    const deps = dependencies({
      getTranscript: vi.fn().mockResolvedValue({
        ...transcriptA,
        segments: [{ endSec: 120.4, position: 0, startSec: 119.5, text: "Đoạn cuối" }],
      }),
      indexVideo: vi.fn().mockResolvedValue(
        indexResponse({ cached: true, chunkCount: 1, indexStatus: "ready" }),
      ),
    });

    await runVideoRagSession({
      dependencies: deps,
      signal: new AbortController().signal,
      video: videoA,
    });

    expect(deps.indexVideo).toHaveBeenCalledWith(
      videoA.videoId,
      expect.objectContaining({
        transcriptSegments: [
          { endSec: 120, position: 0, startSec: 119.5, text: "Đoạn cuối" },
        ],
      }),
      expect.anything(),
    );
  });

  it("marks a cross-video transcript as stale and never indexes it", async () => {
    const deps = dependencies({
      getTranscript: vi.fn().mockResolvedValue({
        ...transcriptA,
        videoId: "bbbbbbbbbbb",
      }),
    });

    const result = await runVideoRagSession({
      dependencies: deps,
      signal: new AbortController().signal,
      video: videoA,
    });

    expect(deps.indexVideo).not.toHaveBeenCalled();
    expect(result).toMatchObject({ errorCode: "STALE_VIDEO", status: "stale" });
  });

  it("surfaces terminal indexing failures with backend retry metadata", async () => {
    const deps = dependencies({
      getIndexStatus: vi.fn().mockResolvedValue(
        statusResponse({
          error: {
            code: "INDEX_FAILED",
            details: null,
            message: "Không thể tạo index.",
            retryable: true,
          },
          indexStatus: "failed",
        }),
      ),
    });

    const result = await runVideoRagSession({
      dependencies: deps,
      pollIntervalMs: 0,
      signal: new AbortController().signal,
      video: videoA,
    });

    expect(result).toMatchObject({
      errorCode: "INDEX_FAILED",
      retryable: true,
      stage: "poll",
      status: "error",
    });
  });

  it("publishes nothing after cancellation", async () => {
    let resolveTranscript: ((value: typeof transcriptA) => void) | undefined;
    const transcriptPromise = new Promise<typeof transcriptA>((resolve) => {
      resolveTranscript = resolve;
    });
    const deps = dependencies({ getTranscript: vi.fn(() => transcriptPromise) });
    const states: VideoRagSessionState[] = [];
    const controller = new AbortController();
    const operation = runVideoRagSession({
      dependencies: deps,
      onState: (state) => states.push(state),
      signal: controller.signal,
      video: videoA,
    });

    controller.abort();
    resolveTranscript?.(transcriptA);

    await expect(operation).resolves.toBeNull();
    expect(states.map((state) => state.status)).toEqual(["loading_transcript"]);
    expect(deps.indexVideo).not.toHaveBeenCalled();
  });
});

describe("useVideoRagSession", () => {
  it("ignores a stale transcript request after the active video changes", async () => {
    const videoB: Video = { ...videoA, title: "Video B", videoId: "bbbbbbbbbbb" };
    let resolveFirst: ((value: typeof transcriptA) => void) | undefined;
    const firstTranscript = new Promise<typeof transcriptA>((resolve) => {
      resolveFirst = resolve;
    });
    const getTranscript = vi
      .fn()
      .mockImplementationOnce(() => firstTranscript)
      .mockResolvedValueOnce({ ...transcriptA, videoId: videoB.videoId });
    const indexVideo = vi.fn(async (videoId: string) =>
      indexResponse({
        cached: true,
        chunkCount: 2,
        indexStatus: "ready",
        videoId,
      }),
    ) as VideoRagSessionDependencies["indexVideo"];
    const deps = dependencies({ getTranscript, indexVideo });
    const { rerender, result } = renderHook(
      ({ video }: { video: Video }) =>
        useVideoRagSession({ dependencies: deps, serviceStatus: "ready", video }),
      { initialProps: { video: videoA } },
    );

    await waitFor(() => expect(getTranscript).toHaveBeenCalledTimes(1));
    rerender({ video: videoB });
    await waitFor(() =>
      expect(result.current.state).toMatchObject({
        status: "ready",
        videoId: videoB.videoId,
      }),
    );

    await act(async () => {
      resolveFirst?.(transcriptA);
      await firstTranscript;
    });

    expect(result.current.state).toMatchObject({ status: "ready", videoId: videoB.videoId });
    expect(indexVideo).toHaveBeenCalledTimes(1);
    expect(indexVideo).toHaveBeenCalledWith(videoB.videoId, expect.anything(), expect.anything());
  });

  it("reuses a ready in-memory session and retry explicitly bypasses that cache", async () => {
    const videoB: Video = { ...videoA, title: "Video B", videoId: "bbbbbbbbbbb" };
    let transcriptCall = 0;
    const getTranscript = vi.fn(async () => {
      transcriptCall += 1;
      return transcriptCall === 1
        ? transcriptA
        : transcriptCall === 2
          ? { ...transcriptA, videoId: videoB.videoId }
          : transcriptA;
    }) as VideoRagSessionDependencies["getTranscript"];
    const indexVideo = vi.fn(async (videoId: string) =>
      indexResponse({
        cached: true,
        chunkCount: 2,
        indexStatus: "ready",
        videoId,
      }),
    ) as VideoRagSessionDependencies["indexVideo"];
    const deps = dependencies({ getTranscript, indexVideo });
    const { rerender, result } = renderHook(
      ({ video }: { video: Video }) =>
        useVideoRagSession({ dependencies: deps, serviceStatus: "ready", video }),
      { initialProps: { video: videoA } },
    );

    await waitFor(() => expect(result.current.isReady).toBe(true));
    rerender({ video: videoB });
    await waitFor(() =>
      expect(result.current.state).toMatchObject({ status: "ready", videoId: videoB.videoId }),
    );
    rerender({ video: videoA });
    await waitFor(() =>
      expect(result.current.state).toMatchObject({ cacheSource: "memory", status: "ready" }),
    );
    expect(getTranscript).toHaveBeenCalledTimes(2);

    act(() => result.current.retry());
    await waitFor(() => expect(getTranscript).toHaveBeenCalledTimes(3));
    expect(indexVideo).toHaveBeenCalledTimes(3);
  });

  it("does not start transcript extraction while the service is offline", () => {
    const deps = dependencies();
    const { result } = renderHook(() =>
      useVideoRagSession({ dependencies: deps, serviceStatus: "offline", video: videoA }),
    );

    expect(result.current.state).toMatchObject({
      serviceStatus: "offline",
      status: "service_offline",
      videoId: videoA.videoId,
    });
    expect(deps.getTranscript).not.toHaveBeenCalled();
  });
});
