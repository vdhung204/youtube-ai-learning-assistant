import type { TranscriptSegment } from "../../types/api";
import type { LearningSection, VideoMilestone } from "../../types/learning";

const TARGET_SECONDS = 300;
const TARGET_CHARACTERS = 8_000;

/** Preserve official chapters; split long ones at transcript boundaries for manageable lessons. */
export function buildLearningSections(
  milestones: VideoMilestone[], durationSec: number, segments: TranscriptSegment[] = [],
): LearningSection[] {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return [];
  const starts = [...new Map(milestones.filter(c => c.startSec >= 0 && c.startSec < durationSec)
    .sort((a, b) => a.startSec - b.startSec).map(c => [c.startSec, c])).values()];
  const official = starts.length > 0;
  if (starts[0]?.startSec !== 0) starts.unshift({startSec: 0, label: official ? "Mở đầu" : "Nội dung video"});
  const result: LearningSection[] = [];
  starts.forEach((chapter, index) => {
    const end = starts[index + 1]?.startSec ?? durationSec;
    const boundaries = [chapter.startSec];
    let characters = 0;
    const transcript = segments.filter(s => s.startSec >= chapter.startSec && s.startSec < end);
    for (const segment of transcript) {
      const previous = boundaries[boundaries.length - 1];
      if (segment.startSec > previous && (segment.startSec - previous >= TARGET_SECONDS || characters >= TARGET_CHARACTERS)) {
        boundaries.push(segment.startSec);
        characters = 0;
      }
      characters += segment.text.length;
    }
    // Also bound long gaps or absent transcript metadata; never fabricate topic names.
    boundaries.push(end);
    const bounded = [boundaries[0]];
    for (const boundary of boundaries.slice(1)) {
      while (boundary - bounded[bounded.length - 1] > TARGET_SECONDS * 1.5) {
        bounded.push(bounded[bounded.length - 1] + TARGET_SECONDS);
      }
      bounded.push(boundary);
    }
    bounded.slice(0, -1).forEach((startSec, part) => result.push({
      id: `${startSec}-${bounded[part + 1]}`,
      title: official ? `${chapter.label}${bounded.length > 2 ? ` — phần ${part + 1}` : ""}` : `Phần ${result.length + 1}`,
      startSec, endSec: bounded[part + 1], source: official ? "youtube" : "transcript",
    }));
  });
  return result;
}

export function learningScopeKey(video: {videoId: string; learningSection?: LearningSection}): string {
  return `${video.videoId}:${video.learningSection?.id ?? "whole"}`;
}
