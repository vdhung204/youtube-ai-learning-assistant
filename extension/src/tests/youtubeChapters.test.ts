import { describe, expect, it } from "vitest";
import {
  extractYouTubeChapters,
  parseChapterTimestamp,
  readYouTubeChapters,
} from "../integrations/youtube/chapters";

describe("YouTube chapters", () => {
  it("parses chapter timestamps", () => {
    expect(parseChapterTimestamp("1:39")).toBe(99);
    expect(parseChapterTimestamp("1:02:03")).toBe(3_723);
    expect(parseChapterTimestamp("99s")).toBe(99);
    expect(parseChapterTimestamp("invalid")).toBeNull();
  });

  it("extracts the complete named chapter list from a player response", () => {
    const chapter = (title: string, startSec: number) => ({
      chapterRenderer: {
        timeRangeStartMillis: startSec * 1_000,
        title: { simpleText: title },
      },
    });
    const response = {
      playerOverlays: {
        playerOverlayRenderer: {
          markersMap: [{
            value: {
              chapters: [
                chapter("Recap on embeddings", 0),
                chapter("Motivating examples", 99),
                chapter("The attention pattern", 269),
                chapter("Masking", 668),
                chapter("Cross-attention", 1_164),
              ],
            },
          }],
        },
      },
    };

    expect(extractYouTubeChapters(response, 1_600)).toEqual([
      { startSec: 0, title: "Recap on embeddings" },
      { startSec: 99, title: "Motivating examples" },
      { startSec: 269, title: "The attention pattern" },
      { startSec: 668, title: "Masking" },
      { startSec: 1_164, title: "Cross-attention" },
    ]);
  });

  it("reads every rendered chapter from YouTube's chapter panel", () => {
    document.body.innerHTML = `
      <ytd-macro-markers-list-item-renderer>
        <a href="https://www.youtube.com/watch?v=video&t=0s">
          <h4 id="title">Recap on embeddings</h4><span id="time">0:00</span>
        </a>
      </ytd-macro-markers-list-item-renderer>
      <ytd-macro-markers-list-item-renderer>
        <a href="https://www.youtube.com/watch?v=video&t=99s">
          <h4 id="title">Motivating examples</h4><span id="time">1:39</span>
        </a>
      </ytd-macro-markers-list-item-renderer>
      <ytd-macro-markers-list-item-renderer>
        <a href="https://www.youtube.com/watch?v=video&t=269s">
          <h4 id="title">The attention pattern</h4><span id="time">4:29</span>
        </a>
      </ytd-macro-markers-list-item-renderer>`;

    expect(readYouTubeChapters()).toEqual([
      { startSec: 0, title: "Recap on embeddings" },
      { startSec: 99, title: "Motivating examples" },
      { startSec: 269, title: "The attention pattern" },
    ]);
  });
});
