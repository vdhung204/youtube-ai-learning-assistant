import type { YouTubeChapter } from "../../types/messages";

const CHAPTER_ITEM_SELECTOR = [
  "ytd-macro-markers-list-item-renderer",
  "ytd-macro-markers-list-renderer [class*='macro-markers-list-item']",
  "[data-chapter-start-time]",
].join(",");
const MAX_CHAPTERS = 500;
const MAX_TITLE_LENGTH = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (!isRecord(value)) {
    return "";
  }
  if (typeof value.simpleText === "string") {
    return value.simpleText;
  }
  if (Array.isArray(value.runs)) {
    return value.runs
      .flatMap((run) => isRecord(run) && typeof run.text === "string" ? [run.text] : [])
      .join("");
  }
  return "";
}

function cleanTitle(value: string): string {
  return value.normalize("NFC").replace(/\s+/gu, " ").trim().slice(0, MAX_TITLE_LENGTH);
}

export function parseChapterTimestamp(value: string): number | null {
  const normalized = value.trim();
  if (/^\d+(?:\.\d+)?s?$/iu.test(normalized)) {
    const seconds = Number(normalized.replace(/s$/iu, ""));
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
  }
  const parts = normalized.split(":").map(Number);
  if (
    parts.length < 2 ||
    parts.length > 3 ||
    parts.some((part) => !Number.isFinite(part) || part < 0)
  ) {
    return null;
  }
  return parts.reduce((seconds, part) => seconds * 60 + part, 0);
}

function startSeconds(renderer: Record<string, unknown>): number | null {
  if (typeof renderer.timeRangeStartMillis === "number") {
    return renderer.timeRangeStartMillis / 1_000;
  }
  if (typeof renderer.startTimeSeconds === "number") {
    return renderer.startTimeSeconds;
  }
  for (const endpointKey of ["onTap", "navigationEndpoint"]) {
    const endpoint = renderer[endpointKey];
    if (!isRecord(endpoint) || !isRecord(endpoint.watchEndpoint)) {
      continue;
    }
    const seconds = endpoint.watchEndpoint.startTimeSeconds;
    if (typeof seconds === "number") {
      return seconds;
    }
  }
  return parseChapterTimestamp(
    textValue(renderer.timeDescription) || textValue(renderer.timeText),
  );
}

function parseRenderer(value: unknown): YouTubeChapter | null {
  if (!isRecord(value)) {
    return null;
  }
  const title = cleanTitle(
    textValue(value.title) || textValue(value.chapterTitle) || textValue(value.headline),
  );
  const startSec = startSeconds(value);
  return title && startSec !== null ? { startSec, title } : null;
}

function normalizeChapters(
  chapters: readonly YouTubeChapter[],
  durationSec?: number,
): YouTubeChapter[] {
  const sorted = chapters
    .filter((chapter) =>
      chapter.title &&
      Number.isFinite(chapter.startSec) &&
      chapter.startSec >= 0 &&
      (!Number.isFinite(durationSec) || durationSec === undefined || chapter.startSec < durationSec),
    )
    .map((chapter) => ({
      startSec: chapter.startSec,
      title: cleanTitle(chapter.title),
    }))
    .filter((chapter) => chapter.title)
    .sort((left, right) => left.startSec - right.startSec);

  const seenStarts = new Set<number>();
  const result: YouTubeChapter[] = [];
  for (const chapter of sorted) {
    const roundedStart = Math.round(chapter.startSec * 1_000) / 1_000;
    if (!seenStarts.has(roundedStart)) {
      seenStarts.add(roundedStart);
      result.push({ ...chapter, startSec: roundedStart });
    }
    if (result.length >= MAX_CHAPTERS) {
      break;
    }
  }
  return result;
}

/** Extracts the most complete official chapter list from YouTube's player response. */
export function extractYouTubeChapters(
  playerResponse: unknown,
  durationSec?: number,
): YouTubeChapter[] {
  const candidates: YouTubeChapter[][] = [];
  const visited = new Set<object>();

  const visit = (value: unknown, depth: number): void => {
    if (depth > 24 || (!isRecord(value) && !Array.isArray(value))) {
      return;
    }
    if (visited.has(value as object)) {
      return;
    }
    visited.add(value as object);

    if (Array.isArray(value)) {
      const direct = value.flatMap((entry) => {
        if (!isRecord(entry)) {
          return [];
        }
        const renderer = entry.chapterRenderer ?? entry.macroMarkersListItemRenderer;
        const chapter = parseRenderer(renderer);
        return chapter ? [chapter] : [];
      });
      if (direct.length > 0) {
        candidates.push(normalizeChapters(direct, durationSec));
      }
      for (const entry of value) {
        visit(entry, depth + 1);
      }
      return;
    }

    for (const child of Object.values(value)) {
      visit(child, depth + 1);
    }
  };

  visit(playerResponse, 0);
  return candidates.reduce<YouTubeChapter[]>(
    (best, candidate) => candidate.length > best.length ? candidate : best,
    [],
  );
}

function secondsFromLink(link: HTMLAnchorElement): number | null {
  try {
    const url = new URL(link.href, window.location.href);
    for (const key of ["t", "start", "time_continue"]) {
      const raw = url.searchParams.get(key);
      if (raw) {
        const seconds = parseChapterTimestamp(raw);
        if (seconds !== null) {
          return seconds;
        }
      }
    }
  } catch {
    // Fall through to the visible timestamp.
  }
  return null;
}

/** DOM fallback for chapters already rendered in YouTube's "Trong video này" panel. */
export function readYouTubeChapters(
  root: ParentNode = document,
  durationSec?: number,
): YouTubeChapter[] {
  const chapters: YouTubeChapter[] = [];
  for (const item of root.querySelectorAll<HTMLElement>(CHAPTER_ITEM_SELECTOR)) {
    const titleElement = item.querySelector<HTMLElement>(
      "#title, #details h4, h4, [class*='chapter-title'], yt-formatted-string",
    );
    const timeElement = item.querySelector<HTMLElement>(
      "#time, #timestamp, [class*='time-description'], [class*='timestamp']",
    );
    const link = item.querySelector<HTMLAnchorElement>("a[href]");
    const attributeTime = item.dataset.chapterStartTime ?? item.getAttribute("data-start-time") ?? "";
    const startSec =
      parseChapterTimestamp(attributeTime) ??
      (link ? secondsFromLink(link) : null) ??
      parseChapterTimestamp(timeElement?.textContent ?? "");
    const title = cleanTitle(titleElement?.textContent ?? "");
    if (startSec !== null && title) {
      chapters.push({ startSec, title });
    }
  }
  return normalizeChapters(chapters, durationSec);
}
