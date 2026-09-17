import {
  loadTranscriptRowsFromYouTubeUi,
  parseTranscriptTimestamp,
  readTranscriptRows,
} from "../integrations/youtube/transcriptDom";
import { describe, expect, it, vi } from "vitest";

describe("YouTube transcript DOM fallback", () => {
  it("parses minute and hour timestamps", () => {
    expect(parseTranscriptTimestamp("01:23")).toBe(83);
    expect(parseTranscriptTimestamp("1:02:03")).toBe(3723);
    expect(parseTranscriptTimestamp("invalid")).toBeNull();
  });

  it("reads and orders current transcript segment markup", () => {
    document.body.innerHTML = `
      <ytd-transcript-segment-renderer>
        <div class="segment-timestamp">0:12</div>
        <yt-formatted-string class="segment-text"> Second   idea </yt-formatted-string>
      </ytd-transcript-segment-renderer>
      <ytd-transcript-segment-renderer>
        <div class="segment-timestamp">0:02</div>
        <yt-formatted-string class="segment-text">First idea</yt-formatted-string>
      </ytd-transcript-segment-renderer>`;

    expect(readTranscriptRows()).toEqual([
      { startSec: 2, text: "First idea" },
      { startSec: 12, text: "Second idea" },
    ]);
  });

  it("opens YouTube's transcript panel and waits for rows", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <ytd-video-description-transcript-section-renderer>
        <button type="button">Show transcript</button>
      </ytd-video-description-transcript-section-renderer>`;
    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      window.setTimeout(() => {
        document.body.insertAdjacentHTML(
          "beforeend",
          `<ytd-transcript-segment-renderer>
             <div class="segment-timestamp">0:05</div>
             <div class="segment-text">Loaded by YouTube</div>
           </ytd-transcript-segment-renderer>`,
        );
      }, 100);
    });

    const promise = loadTranscriptRowsFromYouTubeUi(new AbortController().signal);
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(promise).resolves.toEqual([{ startSec: 5, text: "Loaded by YouTube" }]);
    vi.useRealTimers();
  });
});
