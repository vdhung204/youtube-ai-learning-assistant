import type { TranscriptSegment } from "./api";

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export interface YouTubeVideoContext {
  channel: string;
  currentTimeSec: number;
  durationSec: number;
  language: string;
  thumbnailUrl: string;
  title: string;
  videoId: string;
}

export interface YouTubeChapter {
  startSec: number;
  title: string;
}

export interface YouTubeTranscript {
  chapters?: YouTubeChapter[];
  language: string;
  segments: TranscriptSegment[];
  videoId: string;
}

export type YouTubeTranscriptErrorCode =
  | "NOT_YOUTUBE"
  | "NO_VIDEO"
  | "NO_TRANSCRIPT"
  | "TRANSCRIPT_UNAVAILABLE"
  | "STALE_VIDEO"
  | "INVALID_TRANSCRIPT"
  | "NETWORK_ERROR";

export type ContentRequest =
  | { type: "YALA_GET_VIDEO_CONTEXT" }
  | { type: "YALA_GET_TRANSCRIPT"; videoId: string }
  | { type: "YALA_SEEK_TO"; seconds: number; videoId: string };

export type ContentErrorCode = YouTubeTranscriptErrorCode | "INVALID_TIMESTAMP";

export interface ContentErrorResponse {
  error: ContentErrorCode;
  message?: string;
  ok: false;
  retryable?: boolean;
  videoId?: string;
}

export type ContentResponse =
  | { ok: true; type: "YALA_VIDEO_CONTEXT"; video: YouTubeVideoContext }
  | { ok: true; type: "YALA_TRANSCRIPT"; transcript: YouTubeTranscript }
  | { ok: true; type: "YALA_SEEKED"; currentTimeSec: number }
  | ContentErrorResponse;

export interface VideoChangedMessage {
  type: "YALA_VIDEO_CHANGED";
  videoId: string | null;
}

export interface VideoTimeChangedMessage {
  type: "YALA_VIDEO_TIME_CHANGED";
  videoId: string;
  currentTimeSec: number;
  durationSec: number;
}

const CONTENT_ERROR_CODES: readonly ContentErrorCode[] = [
  "NOT_YOUTUBE",
  "NO_VIDEO",
  "NO_TRANSCRIPT",
  "TRANSCRIPT_UNAVAILABLE",
  "STALE_VIDEO",
  "INVALID_TRANSCRIPT",
  "NETWORK_ERROR",
  "INVALID_TIMESTAMP",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidVideoId(value: unknown): value is string {
  return typeof value === "string" && VIDEO_ID_PATTERN.test(value);
}

export function isVideoChangedMessage(value: unknown): value is VideoChangedMessage {
  return (
    isRecord(value) &&
    value.type === "YALA_VIDEO_CHANGED" &&
    (value.videoId === null || isValidVideoId(value.videoId))
  );
}

export function isVideoTimeChangedMessage(value: unknown): value is VideoTimeChangedMessage {
  return (
    isRecord(value) &&
    value.type === "YALA_VIDEO_TIME_CHANGED" &&
    isValidVideoId(value.videoId) &&
    isFiniteNumber(value.currentTimeSec) &&
    isFiniteNumber(value.durationSec)
  );
}

function isVideoContext(value: unknown): value is YouTubeVideoContext {
  return (
    isRecord(value) &&
    isValidVideoId(value.videoId) &&
    typeof value.title === "string" &&
    typeof value.channel === "string" &&
    isFiniteNumber(value.durationSec) &&
    isFiniteNumber(value.currentTimeSec) &&
    typeof value.language === "string" &&
    typeof value.thumbnailUrl === "string"
  );
}

function isTranscriptSegment(value: unknown): value is TranscriptSegment {
  return (
    isRecord(value) &&
    typeof value.text === "string" &&
    value.text.trim().length > 0 &&
    isFiniteNumber(value.startSec) &&
    value.startSec >= 0 &&
    isFiniteNumber(value.endSec) &&
    value.endSec >= value.startSec &&
    Number.isInteger(value.position) &&
    typeof value.position === "number" &&
    value.position >= 0
  );
}

function isYouTubeChapter(value: unknown): value is YouTubeChapter {
  return (
    isRecord(value) &&
    typeof value.title === "string" &&
    value.title.trim().length > 0 &&
    value.title.length <= 200 &&
    isFiniteNumber(value.startSec) &&
    value.startSec >= 0
  );
}

export function isYouTubeTranscript(value: unknown): value is YouTubeTranscript {
  if (
    !isRecord(value) ||
    !isValidVideoId(value.videoId) ||
    typeof value.language !== "string" ||
    value.language.trim().length === 0 ||
    !Array.isArray(value.segments) ||
    value.segments.length === 0 ||
    value.segments.length > 20_000
  ) {
    return false;
  }

  if (
    value.chapters !== undefined &&
    (!Array.isArray(value.chapters) ||
      value.chapters.length > 500 ||
      value.chapters.some((chapter) => !isYouTubeChapter(chapter)))
  ) {
    return false;
  }

  let previousPosition = -1;
  let previousStart = -1;
  for (const segment of value.segments) {
    if (
      !isTranscriptSegment(segment) ||
      segment.position <= previousPosition ||
      segment.startSec < previousStart
    ) {
      return false;
    }
    previousPosition = segment.position;
    previousStart = segment.startSec;
  }
  return true;
}

function isContentErrorResponse(value: unknown): value is ContentErrorResponse {
  if (!isRecord(value)) {
    return false;
  }
  return (
    value.ok === false &&
    CONTENT_ERROR_CODES.includes(value.error as ContentErrorCode) &&
    (value.message === undefined || typeof value.message === "string") &&
    (value.retryable === undefined || typeof value.retryable === "boolean") &&
    (value.videoId === undefined || isValidVideoId(value.videoId))
  );
}

export function isContentResponse(value: unknown): value is ContentResponse {
  if (!isRecord(value)) {
    return false;
  }
  if (value.ok === false) {
    return isContentErrorResponse(value);
  }
  if (value.ok !== true) {
    return false;
  }

  if (value.type === "YALA_VIDEO_CONTEXT") {
    return isVideoContext(value.video);
  }
  if (value.type === "YALA_TRANSCRIPT") {
    return isYouTubeTranscript(value.transcript);
  }
  return value.type === "YALA_SEEKED" && isFiniteNumber(value.currentTimeSec);
}
