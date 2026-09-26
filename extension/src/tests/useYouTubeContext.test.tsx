import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NOTICE_AUTO_DISMISS_MS,
  useYouTubeContext,
} from "../sidebar/hooks/useYouTubeContext";
import { createLearningChromeMock } from "./chromeMock";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useYouTubeContext notices", () => {
  it("automatically dismisses a seek notice after five seconds", async () => {
    vi.stubGlobal("chrome", createLearningChromeMock());
    const { result } = renderHook(() => useYouTubeContext(true));
    await waitFor(() => expect(result.current.state.status).toBe("ready"));

    vi.useFakeTimers();
    await act(async () => {
      await result.current.seekTo(42);
    });
    expect(result.current.notice?.message).toBe("Đã chuyển video tới 42 giây.");

    act(() => vi.advanceTimersByTime(NOTICE_AUTO_DISMISS_MS - 1));
    expect(result.current.notice).not.toBeNull();

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.notice).toBeNull();
  });
});
