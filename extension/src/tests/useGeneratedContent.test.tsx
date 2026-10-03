import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LoadLearningContentOptions } from "../integrations/learning/types";
import { useGeneratedContent } from "../sidebar/hooks/useGeneratedContent";
import type { CurrentVideo } from "../types/learning";

const video: CurrentVideo = {
  channel: "Test channel",
  currentTimeSec: 0,
  dataSource: "youtube",
  durationSec: 120,
  language: "vi",
  thumbnailLabel: "YOUTUBE",
  title: "Learning video",
  videoId: "dQw4w9WgXcQ",
};

function pendingContent() {
  let resolve!: (items: string[]) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<string[]>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

afterEach(cleanup);

describe("useGeneratedContent", () => {
  it("loads once and does not regenerate for playback or presentation-only changes", async () => {
    const loadContent = vi.fn().mockResolvedValue(["saved content"]);
    const resetProgress = vi.fn();
    const { result, rerender } = renderHook(
      ({ currentVideo }) => useGeneratedContent(currentVideo, loadContent, resetProgress, "Fallback"),
      { initialProps: { currentVideo: video } },
    );

    await waitFor(() => expect(result.current.loadState).toEqual({
      status: "ready", items: ["saved content"],
    }));
    rerender({ currentVideo: { ...video, currentTimeSec: 30, thumbnailLabel: "Updated" } });

    expect(loadContent).toHaveBeenCalledOnce();
    expect(loadContent.mock.calls[0]?.[0]).toEqual(video);
    expect(loadContent.mock.calls[0]?.[1]).toMatchObject({ regenerate: false });
    expect(loadContent.mock.calls[0]?.[1]?.onStage).toEqual(expect.any(Function));
    expect(resetProgress).toHaveBeenCalledOnce();
  });

  it("regenerates on every explicit request and retries without bypassing the cache", async () => {
    const loadContent = vi.fn()
      .mockResolvedValueOnce(["initial"])
      .mockResolvedValueOnce(["second"])
      .mockRejectedValueOnce(new Error("quota exhausted"))
      .mockResolvedValueOnce(["second"]);
    const resetProgress = vi.fn();
    const { result } = renderHook(() => useGeneratedContent(video, loadContent, resetProgress, "Fallback"));

    await waitFor(() => expect(result.current.loadState.status).toBe("ready"));
    await act(async () => result.current.regenerate());
    expect(result.current.loadState).toEqual({ status: "ready", items: ["second"] });
    await act(async () => result.current.regenerate());
    expect(result.current.loadState).toEqual({ status: "error", message: "quota exhausted" });
    await act(async () => result.current.retry());

    expect(result.current.loadState).toEqual({ status: "ready", items: ["second"] });
    expect(loadContent.mock.calls.map(([, options]) => options?.regenerate)).toEqual([
      false, true, true, false,
    ]);
    expect(resetProgress).toHaveBeenCalledTimes(4);
  });

  it.each(["resolve", "reject"] as const)(
    "ignores an old video's late %s after switching video",
    async (settlement) => {
      const oldRequest = pendingContent();
      const newRequest = pendingContent();
      const loadContent = vi.fn()
        .mockReturnValueOnce(oldRequest.promise)
        .mockReturnValueOnce(newRequest.promise);
      const resetProgress = vi.fn();
      const { result, rerender } = renderHook(
        ({ currentVideo }) => useGeneratedContent(currentVideo, loadContent, resetProgress, "Fallback"),
        { initialProps: { currentVideo: video } },
      );

      rerender({ currentVideo: { ...video, videoId: "new-video" } });
      expect(result.current.loadState.status).toBe("loading");
      await act(async () => newRequest.resolve(["new content"]));
      await act(async () => {
        if (settlement === "resolve") oldRequest.resolve(["outdated content"]);
        else oldRequest.reject(new Error("outdated error"));
      });

      expect(result.current.loadState).toEqual({ status: "ready", items: ["new content"] });
      expect(resetProgress).toHaveBeenCalledTimes(2);
    },
  );

  it("uses the view-specific error message for non-Error rejections", async () => {
    const loadContent = vi.fn().mockRejectedValue("unknown failure");
    const resetProgress = vi.fn();
    const { result } = renderHook(() => useGeneratedContent(video, loadContent, resetProgress, "Fallback"));

    await waitFor(() => expect(result.current.loadState).toEqual({ status: "error", message: "Fallback" }));
  });

  it("does not publish a pending result after unmount", async () => {
    const request = pendingContent();
    const loadContent = vi.fn().mockReturnValue(request.promise);
    const resetProgress = vi.fn();
    const { result, unmount } = renderHook(() => useGeneratedContent(video, loadContent, resetProgress, "Fallback"));

    unmount();
    await act(async () => request.resolve(["cached after unmount"]));

    expect(result.current.loadState).toEqual({ status: "loading", stage: "cache" });
    expect(loadContent).toHaveBeenCalledOnce();
  });

  it("publishes retrieval and generation loading stages", async () => {
    const request = pendingContent();
    const loadContent = vi.fn((_video: CurrentVideo, options?: LoadLearningContentOptions) => {
      options?.onStage?.("retrieving");
      return request.promise;
    });
    const resetProgress = vi.fn();
    const { result } = renderHook(() => useGeneratedContent(video, loadContent, resetProgress, "Fallback"));

    await waitFor(() => expect(result.current.loadState).toEqual({
      status: "loading",
      stage: "retrieving",
    }));
    await act(async () => {
      loadContent.mock.calls[0]?.[1]?.onStage?.("generating");
    });
    expect(result.current.loadState).toEqual({ status: "loading", stage: "generating" });

    await act(async () => request.resolve(["ready"]));
    expect(result.current.loadState).toEqual({ status: "ready", items: ["ready"] });
  });
});
