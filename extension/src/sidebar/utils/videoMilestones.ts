import type { VideoMilestone } from "../../types/learning";
import type { YouTubeChapter } from "../../types/messages";

const MAX_LABEL_LENGTH = 200;

function cleanLabel(text: string): string {
  const normalized = text.normalize("NFC").replace(/\s+/gu, " ").trim();
  if (normalized.length <= MAX_LABEL_LENGTH) {
    return normalized;
  }
  const prefix = normalized.slice(0, MAX_LABEL_LENGTH - 1);
  const wordBoundary = prefix.lastIndexOf(" ");
  return `${prefix.slice(0, wordBoundary >= 48 ? wordBoundary : undefined).trimEnd()}…`;
}

export function buildVideoMilestones(
  chapters: readonly YouTubeChapter[],
): VideoMilestone[] {
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
