import type { VideoMilestone } from "../types/learning";
import type { YouTubeChapter } from "../types/messages";

export function formatDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function cleanLabel(text: string): string {
  const normalized = text.normalize("NFC").replace(/\s+/gu, " ").trim();
  if (normalized.length <= 200) {
    return normalized;
  }
  const prefix = normalized.slice(0, 199);
  const wordBoundary = prefix.lastIndexOf(" ");
  return `${prefix.slice(0, wordBoundary >= 48 ? wordBoundary : undefined).trimEnd()}…`;
}

export function buildVideoMilestones(chapters: readonly YouTubeChapter[]): VideoMilestone[] {
  const seenStarts = new Set<number>();
  return chapters
    .filter((chapter) => Number.isFinite(chapter.startSec) && chapter.startSec >= 0 && chapter.title.trim())
    .sort((left, right) => left.startSec - right.startSec)
    .flatMap((chapter) => {
      if (seenStarts.has(chapter.startSec)) {
        return [];
      }
      seenStarts.add(chapter.startSec);
      return [{ label: cleanLabel(chapter.title), startSec: chapter.startSec }];
    });
}
