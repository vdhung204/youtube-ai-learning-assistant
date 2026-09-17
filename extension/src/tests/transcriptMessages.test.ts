import { describe, expect, it } from "vitest";
import { isContentResponse, isYouTubeTranscript } from "../types/messages";

const transcript = {
  language: "en",
  segments: [
    { endSec: 2.5, position: 0, startSec: 0, text: "First caption" },
    { endSec: 5, position: 1, startSec: 2.5, text: "Second caption" },
  ],
  videoId: "dQw4w9WgXcQ",
};

describe("YouTube transcript message contract", () => {
  it("validates a timestamped, ordered transcript response", () => {
    expect(isYouTubeTranscript(transcript)).toBe(true);
    expect(
      isContentResponse({ ok: true, transcript, type: "YALA_TRANSCRIPT" }),
    ).toBe(true);
  });

  it("rejects malformed, empty, or out-of-order transcript segments", () => {
    expect(isYouTubeTranscript({ ...transcript, segments: [] })).toBe(false);
    expect(
      isYouTubeTranscript({
        ...transcript,
        segments: [
          transcript.segments[1],
          transcript.segments[0],
        ],
      }),
    ).toBe(false);
    expect(
      isYouTubeTranscript({
        ...transcript,
        segments: [{ endSec: 1, position: 0, startSec: 2, text: "Invalid" }],
      }),
    ).toBe(false);
  });

  it("accepts stable transcript error details", () => {
    expect(
      isContentResponse({
        error: "NO_TRANSCRIPT",
        message: "No captions",
        ok: false,
        retryable: false,
        videoId: "dQw4w9WgXcQ",
      }),
    ).toBe(true);
  });
});
