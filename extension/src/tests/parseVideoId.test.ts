import { describe, expect, it } from "vitest";
import { parseYouTubeVideoId } from "../integrations/youtube/parseVideoId";

describe("parseYouTubeVideoId", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?t=42", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ])("extracts a supported YouTube URL", (url, expected) => {
    expect(parseYouTubeVideoId(url)).toBe(expected);
  });

  it.each([
    "https://example.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=short",
    "not-a-url",
  ])("rejects invalid or unrelated URLs", (url) => {
    expect(parseYouTubeVideoId(url)).toBeNull();
  });
});
