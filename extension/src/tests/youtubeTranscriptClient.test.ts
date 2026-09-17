import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getActiveVideoTranscript,
  YouTubeTranscriptError,
} from "../integrations/youtube/client";
import { createChromeMock } from "./chromeMock";

const videoContextResponse = {
  ok: true,
  type: "YALA_VIDEO_CONTEXT",
  video: {
    channel: "Channel",
    currentTimeSec: 4,
    durationSec: 120,
    language: "en",
    thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    title: "Video",
    videoId: "dQw4w9WgXcQ",
  },
} as const;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getActiveVideoTranscript", () => {
  it("requests the transcript with the detected video id and returns timestamped segments", async () => {
    const sendMessage = vi
      .fn()
      .mockResolvedValueOnce(videoContextResponse)
      .mockResolvedValueOnce({
        ok: true,
        transcript: {
          chapters: [
            { startSec: 0, title: "Introduction" },
            { startSec: 60, title: "Main concept" },
          ],
          language: "en",
          segments: [{ endSec: 3, position: 0, startSec: 1, text: "Caption" }],
          videoId: "dQw4w9WgXcQ",
        },
        type: "YALA_TRANSCRIPT",
      });
    const chromeMock = createChromeMock({ sendMessage });
    chromeMock.tabs.query.mockResolvedValue([{ id: 7 }]);
    vi.stubGlobal("chrome", chromeMock);

    await expect(getActiveVideoTranscript()).resolves.toEqual({
      chapters: [
        { startSec: 0, title: "Introduction" },
        { startSec: 60, title: "Main concept" },
      ],
      language: "en",
      segments: [{ endSec: 3, position: 0, startSec: 1, text: "Caption" }],
      videoId: "dQw4w9WgXcQ",
    });
    expect(sendMessage).toHaveBeenNthCalledWith(2, 7, {
      type: "YALA_GET_TRANSCRIPT",
      videoId: "dQw4w9WgXcQ",
    });
  });

  it("preserves terminal no-caption errors from the content script", async () => {
    const sendMessage = vi
      .fn()
      .mockResolvedValueOnce(videoContextResponse)
      .mockResolvedValueOnce({
        error: "NO_TRANSCRIPT",
        message: "Video has no captions",
        ok: false,
        retryable: false,
        videoId: "dQw4w9WgXcQ",
      });
    const chromeMock = createChromeMock({ sendMessage });
    chromeMock.tabs.query.mockResolvedValue([{ id: 7 }]);
    vi.stubGlobal("chrome", chromeMock);

    await expect(getActiveVideoTranscript()).rejects.toMatchObject({
      code: "NO_TRANSCRIPT",
      message: "Video has no captions",
      retryable: false,
    } satisfies Partial<YouTubeTranscriptError>);
  });

  it("rejects a result when the active tab changes while captions are loading", async () => {
    const sendMessage = vi
      .fn()
      .mockResolvedValueOnce(videoContextResponse)
      .mockResolvedValueOnce({
        ok: true,
        transcript: {
          language: "en",
          segments: [{ endSec: 3, position: 0, startSec: 1, text: "Caption" }],
          videoId: "dQw4w9WgXcQ",
        },
        type: "YALA_TRANSCRIPT",
      });
    const chromeMock = createChromeMock({ sendMessage });
    chromeMock.tabs.query
      .mockResolvedValueOnce([{ id: 7 }])
      .mockResolvedValueOnce([{ id: 8 }]);
    vi.stubGlobal("chrome", chromeMock);

    await expect(getActiveVideoTranscript()).rejects.toMatchObject({
      code: "STALE_VIDEO",
      retryable: true,
    } satisfies Partial<YouTubeTranscriptError>);
  });
});
